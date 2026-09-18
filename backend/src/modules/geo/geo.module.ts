import { Global, Module } from '@nestjs/common';
import { GEOCODER } from '../../common/contracts/geocoder.contract';
import { GeoController } from './api/geo.controller';
import { SuperAdminGeoController } from './api/super-admin-geo.controller';
import { AddressLookupService } from './application/address-lookup.service';
import { PropertyService } from './application/property.service';
import { RollUpdateService } from './application/roll-update.service';
import { AdressesQuebecClient } from './infrastructure/adresses-quebec.client';
import { NominatimClient } from './infrastructure/nominatim.client';

/**
 * Module `geo` (B40) — référentiel géographique.
 *
 * - Autocomplétion et résolution d'adresse via Adresses Québec (MRNF).
 * - Fiche propriété depuis le rôle d'évaluation foncière importé
 *   (`property_units`, plateforme-wide, chargé par backend/scripts/geo/import-role.py).
 * - Mise à jour du rôle depuis le portail super-admin (`RollUpdateService`,
 *   `/api/super-admin/geo/*`), qui émet `geo.roll.imported` (contrat commun).
 * - Implémente le contrat `GEOCODER` (`common/contracts/geocoder.contract.ts`)
 *   consommé par `clients` et `dispatch-map` sans import croisé. `@Global()`
 *   pour la même raison que `SystemConfigsModule`.
 */
@Global()
@Module({
  controllers: [GeoController, SuperAdminGeoController],
  providers: [
    AdressesQuebecClient,
    NominatimClient,
    AddressLookupService,
    PropertyService,
    RollUpdateService,
    { provide: GEOCODER, useExisting: AddressLookupService },
  ],
  exports: [GEOCODER],
})
export class GeoModule {}
