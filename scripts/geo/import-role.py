#!/usr/bin/env python3
"""
B40 — Import du rôle d'évaluation foncière géoréférencé (MAMH, CC-BY 4.0)
dans les tables plateforme-wide `municipalities`, `land_use_codes` et
`property_units` du backend.

Source : https://www.donneesquebec.ca/recherche/dataset/roles-d-evaluation-fonciere-du-quebec
  - ROLE<year>_GEOPACKAGE.zip  → Role_<year>_2.gpkg (SQLite) + Domaines de valeurs/*.dbf
  - indexRole<year>.csv        → code géographique → nom de municipalité

Usage :
  python3 scripts/geo/import-role.py --gpkg /tmp/role2026/Role2026_geopackage/Role_2026_2.gpkg \
      --index /tmp/role2026/indexRole2026.csv --year 2026 \
      --dsn postgresql://taskmgr:***@localhost:5434/taskmgr [--limit 50000]

Dépendances : Python 3 (stdlib) + `psql` dans le PATH (ou --psql "docker exec -i taskmgr_postgres psql").
Idempotent : chaque table est tronquée puis rechargée dans une même transaction ;
en cas d'erreur, l'ancien contenu reste en place. Prévoir ~10 min pour 3,8 M lignes.
"""
from __future__ import annotations

import argparse
import csv
import glob
import os
import shlex
import sqlite3
import struct
import subprocess
import sys
import tempfile
import time
import unicodedata

# ── Domaines de valeurs (DBF) ────────────────────────────────────────────────

def read_dbf(path: str) -> list[list[str]]:
    with open(path, 'rb') as f:
        hdr = f.read(32)
        nrec, hlen, rlen = struct.unpack('<xxxxIHH', hdr[:12])
        fields: list[tuple[str, int]] = []
        f.seek(32)
        while True:
            fd = f.read(32)
            if fd[0] == 0x0D:
                break
            fields.append((fd[:11].split(b'\0')[0].decode('latin-1'), fd[16]))
        f.seek(hlen)
        rows = []
        for _ in range(nrec):
            rec = f.read(rlen)
            if rec[:1] == b'*':
                continue
            pos, row = 1, []
            for _, ln in fields:
                row.append(rec[pos:pos + ln].decode('utf-8', errors='replace').strip())
                pos += ln
            rows.append(row)
    return rows


def load_domain(domains_dir: str, name: str) -> dict[str, str]:
    paths = glob.glob(os.path.join(domains_dir, f'{name}*.dbf'))
    if not paths:
        print(f'⚠️  domaine {name} introuvable dans {domains_dir}', file=sys.stderr)
        return {}
    return {code: label for code, label in read_dbf(paths[0]) if code}


# ── Normalisation (miroir de backend/src/modules/geo/application/address-normalize.ts) ──

GENERICS = {
    'rue', 'avenue', 'av', 'ave', 'boulevard', 'boul', 'bd', 'blvd', 'chemin', 'ch', 'route', 'rte',
    'rang', 'rg', 'montee', 'place', 'pl', 'allee', 'impasse', 'imp', 'cours', 'croissant', 'crois',
    'terrasse', 'promenade', 'autoroute', 'aut', 'carre', 'cercle', 'sentier', 'ruelle', 'voie',
    'descente', 'domaine', 'desserte', 'esplanade', 'jardin', 'passage', 'plateau', 'traverse',
    'concession', 'cote', 'drive', 'dr', 'road', 'rd', 'street', 'st', 'crescent', 'cres', 'court',
    'ct', 'lane', 'ln', 'trail', 'circle', 'ridge', 'garden', 'terrace', 'square', 'sq',
}
ARTICLES = {'de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'a', 'au', 'aux', 'en', 'sur', 'chez', 'the', 'of'}
ORIENTATIONS = {'est', 'ouest', 'nord', 'sud', 'east', 'west', 'north', 'south'}


def strip_accents(s: str) -> str:
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')


def normalize_street(raw: str | None) -> str:
    if not raw:
        return ''
    s = strip_accents(raw.lower()).replace("'", ' ').replace('’', ' ').replace('`', ' ')
    all_tokens = ''.join(ch if ch.isalnum() else ' ' for ch in s).split()
    tokens = [t for t in all_tokens if t not in GENERICS and t not in ARTICLES]
    if not tokens:  # « Côte », « Place », « Rang » peuvent être tout l'odonyme
        tokens = [t for t in all_tokens if t not in ARTICLES]
        if len(tokens) > 1 and tokens[0] in GENERICS:
            tokens = tokens[1:]
    while len(tokens) > 1 and tokens[-1] in ORIENTATIONS:
        tokens.pop()
    return ' '.join(tokens)


# ── Géométrie GeoPackage → (lon, lat) du premier point ───────────────────────

_ENVELOPE_SIZE = {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}


def first_point(blob: bytes) -> tuple[float, float] | None:
    if not blob or blob[:2] != b'GP':
        return None
    flags = blob[3]
    hdr = 8 + _ENVELOPE_SIZE.get((flags >> 1) & 7, 0)
    wkb = blob[hdr:]
    if len(wkb) < 5:
        return None
    e = '<' if wkb[0] == 1 else '>'
    gtype = struct.unpack(e + 'I', wkb[1:5])[0] & 0xFF
    if gtype == 1:  # Point
        x, y = struct.unpack(e + 'dd', wkb[5:21])
        return x, y
    if gtype == 4:  # MultiPoint → first point
        n = struct.unpack(e + 'I', wkb[5:9])[0]
        if n == 0:
            return None
        e2 = '<' if wkb[9] == 1 else '>'
        x, y = struct.unpack(e2 + 'dd', wkb[14:30])
        return x, y
    return None


def to_int(v) -> int | None:
    if v is None or v == '':
        return None
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def to_float(v) -> float | None:
    if v is None or v == '':
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


# ── Chargement Postgres via psql (COPY) ───────────────────────────────────────

def run_psql(psql_cmd: list[str], dsn: str, commands: list[str], stdin_path: str | None = None) -> None:
    """Runs the commands in ONE transaction (--single-transaction). `\\copy … FROM pstdin`
    reads the CSV from psql's stdin, which also works when psql runs inside Docker."""
    cmd = [*psql_cmd, dsn, '-v', 'ON_ERROR_STOP=1', '-q', '--single-transaction']
    for c in commands:
        cmd += ['-c', c]
    if stdin_path is None:
        subprocess.run(cmd, stdin=subprocess.DEVNULL, check=True)
        return
    with open(stdin_path, 'rb') as fh:
        subprocess.run(cmd, stdin=fh, check=True)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--gpkg', required=True)
    ap.add_argument('--index', required=True, help='indexRole<year>.csv')
    ap.add_argument('--year', type=int, required=True)
    ap.add_argument('--dsn', required=True, help='postgresql://user:pass@host:port/db')
    ap.add_argument('--psql', default='psql', help='commande psql, ex. "docker exec -i taskmgr_postgres psql"')
    ap.add_argument('--limit', type=int, default=0, help='nombre max d’adresses (test)')
    args = ap.parse_args()

    psql_cmd = shlex.split(args.psql)
    domains_dir = os.path.join(os.path.dirname(args.gpkg), 'Domaines de valeurs')
    generic = load_domain(domains_dir, 'CODE_GENERIQUE_ADRESSE')
    link = load_domain(domains_dir, 'CODE_LIEN_ADRESSE')
    cubf = load_domain(domains_dir, 'CODE_UTILISATION_CUBF_3')
    print(f'domaines : {len(generic)} génériques, {len(link)} particules, {len(cubf)} codes CUBF')

    tmp = tempfile.mkdtemp(prefix='role-import-')
    t0 = time.time()

    # 1. municipalities
    mun_csv = os.path.join(tmp, 'municipalities.csv')
    with open(args.index, encoding='utf-8-sig', newline='') as fi, open(mun_csv, 'w', newline='') as fo:
        w = csv.writer(fo)
        n = 0
        for row in csv.DictReader(fi):
            code = (row.get('code géographique') or row.get('code geographique') or '').strip().zfill(5)
            name = (row.get('nom du territoire') or '').strip()
            if code and name:
                w.writerow([code, name, args.year]); n += 1
    print(f'municipalités : {n}')

    # 2. land_use_codes
    cubf_csv = os.path.join(tmp, 'land_use_codes.csv')
    with open(cubf_csv, 'w', newline='') as fo:
        w = csv.writer(fo)
        for code, label in cubf.items():
            w.writerow([code, label])

    # 3. property_units — jointure adresses × unités × points × lots
    db = sqlite3.connect(f'file:{args.gpkg}?mode=ro', uri=True)
    db.execute('PRAGMA temp_store=MEMORY')
    c = db.cursor()
    y = args.year
    print('index temporaires SQLite (première fois : quelques minutes)…')
    db.close()
    db = sqlite3.connect(args.gpkg)
    for tbl, col in ((f'b05v_unite_evaln_{y}', 'id_provinc'), (f'rol_unite_p_{y}', 'id_provinc'), (f'b05v_lot_cadst_{y}', 'id_provinc')):
        db.execute(f'CREATE INDEX IF NOT EXISTS idx_{tbl}_{col} ON "{tbl}"("{col}")')
    db.commit()
    c = db.cursor()

    sql = f'''
      SELECT a.id_provinc, a.no_seq_adr, a.code_mun, a.mat18,
             a.rl0101a, a.rl0101b, a.rl0101c, a.rl0101d, a.rl0101e, a.rl0101f, a.rl0101g, a.rl0101h, a.rl0101i,
             p.geom,
             u.rl0105a, u.rl0307a, u.rl0306a, u.rl0311a, u.rl0302a, u.rl0308a, u.rl0402a, u.rl0403a, u.rl0404a,
             (SELECT group_concat(l.rl0103a, ', ') FROM (SELECT rl0103a FROM "b05v_lot_cadst_{y}" l WHERE l.id_provinc = a.id_provinc AND l.rl0103a IS NOT NULL LIMIT 3) l)
      FROM "b05v_adr_unite_evaln_{y}" a
      JOIN "rol_unite_p_{y}" p ON p.id_provinc = a.id_provinc
      LEFT JOIN "b05v_unite_evaln_{y}" u ON u.id_provinc = a.id_provinc
      WHERE a.rl0101g IS NOT NULL AND a.rl0101g <> ''
    '''
    if args.limit:
        sql += f' LIMIT {int(args.limit)}'

    units_csv = os.path.join(tmp, 'property_units.csv')
    seen: set[tuple[str, int]] = set()
    n = skipped = 0
    with open(units_csv, 'w', newline='') as fo:
        w = csv.writer(fo)
        for r in c.execute(sql):
            (idp, seq, code_mun, mat18, a, b, cnum_end, d, gen, lnk, odonyme, orient, unit,
             geom, cubf_code, year_built, storeys, dwellings, land_area, floor_area, v_land, v_bldg, v_total, lots) = r
            pt = first_point(geom)
            seq_i = to_int(seq) or 1
            name = (odonyme or '').strip()
            norm = normalize_street(name)
            # Sans point, doublon, ou odonyme vide/placeholder (« - ») : inutilisable pour la correspondance.
            if pt is None or (idp, seq_i) in seen or not norm:
                skipped += 1
                continue
            seen.add((idp, seq_i))
            lon, lat = pt
            w.writerow([
                idp, seq_i, (code_mun or '').zfill(5), mat18 or '',
                to_int(a), (b or '').strip() or None, to_int(cnum_end),
                generic.get((gen or '').strip()) or None, link.get((lnk or '').strip()) or None,
                name, norm, (orient or '').strip() or None, (unit or '').strip() or None,
                lat, lon,
                (cubf_code or '').strip() or None, to_int(year_built), to_int(storeys), to_int(dwellings),
                to_float(land_area), to_float(floor_area), to_int(v_land), to_int(v_bldg), to_int(v_total),
                lots or None, y,
            ])
            n += 1
            if n % 250000 == 0:
                print(f'  {n:,} adresses extraites… ({time.time() - t0:.0f}s)')
    db.close()
    print(f'adresses : {n:,} extraites, {skipped:,} ignorées (sans point ou doublon) en {time.time() - t0:.0f}s')

    # 4. COPY dans Postgres, une transaction par table (anciennes données conservées en cas d'échec)
    print('chargement Postgres…')
    run_psql(psql_cmd, args.dsn, [
        'TRUNCATE municipalities',
        "\\copy municipalities (code, name, roll_year) FROM pstdin WITH (FORMAT csv)",
    ], stdin_path=mun_csv)
    run_psql(psql_cmd, args.dsn, [
        'TRUNCATE land_use_codes',
        "\\copy land_use_codes (code, label) FROM pstdin WITH (FORMAT csv)",
    ], stdin_path=cubf_csv)
    run_psql(psql_cmd, args.dsn, [
        'TRUNCATE property_units',
        "\\copy property_units (id_provinc, address_seq, code_mun, matricule, civic_number, civic_suffix, "
        "civic_number_end, street_generic, street_link, street_name, street_norm, orientation, unit_number, "
        "latitude, longitude, land_use_code, year_built, storeys, dwellings, land_area_m2, floor_area_m2, "
        "value_land, value_building, value_total, lot_numbers, roll_year) FROM pstdin WITH (FORMAT csv, NULL '')",
    ], stdin_path=units_csv)
    run_psql(psql_cmd, args.dsn, ['ANALYZE property_units'])
    print(f'✅ terminé en {time.time() - t0:.0f}s — fichiers temporaires dans {tmp}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
