#!/usr/bin/env python3
"""Lit versionName / versionCode dans le manifeste binaire (AXML) d'un APK, sans aapt.

  scripts/mobile/apk-version.py app.apk            → "0.7.0 700"
  scripts/mobile/apk-version.py app.apk --name     → "0.7.0"
"""
import struct, sys, zipfile

name_only = "--name" in sys.argv
args = [a for a in sys.argv[1:] if not a.startswith("--")]
data = zipfile.ZipFile(args[0]).read('AndroidManifest.xml')
def u32(o): return struct.unpack_from('<I', data, o)[0]
# string pool chunk follows the 8-byte file header
off = 8
strings = []
while off < len(data):
    ctype, hsize, csize = struct.unpack_from('<HHI', data, off)
    if ctype == 0x0001:  # RES_STRING_POOL_TYPE
        count, flags, strs_start = u32(off+8), u32(off+16), u32(off+20)
        utf8 = bool(flags & (1 << 8))
        offs = [u32(off+28+4*i) for i in range(count)]
        for so in offs:
            p = off + strs_start + so
            if utf8:
                n = data[p]; p += 1
                if n & 0x80: p += 1
                n = data[p]; p += 1
                if n & 0x80: n = ((n & 0x7f) << 8) | data[p]; p += 1
                strings.append(data[p:p+n].decode('utf-8', 'replace'))
            else:
                n = struct.unpack_from('<H', data, p)[0]; p += 2
                if n & 0x8000: n = ((n & 0x7fff) << 16) | struct.unpack_from('<H', data, p)[0]; p += 2
                strings.append(data[p:p+2*n].decode('utf-16-le', 'replace'))
    elif ctype == 0x0102:  # START_ELEMENT
        name_idx = u32(off+20)
        if strings[name_idx] == 'manifest':
            attr_start, attr_size, attr_count = struct.unpack_from('<HHH', data, off+24)
            a = off + 16 + attr_start
            code, name_ = None, None
            for i in range(attr_count):
                ns, name, raw, size, res0, typ, val = struct.unpack_from('<IIIHBBI', data, a + i*attr_size)
                nm = strings[name]
                if nm == 'versionCode': code = val
                if nm == 'versionName': name_ = strings[raw] if raw != 0xffffffff else str(val)
            if name_ is None:
                sys.exit('versionName introuvable dans AndroidManifest.xml')
            print(name_ if name_only else f'{name_} {code}')
            break
    off += csize
