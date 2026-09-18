import { Global, Module } from '@nestjs/common';
import { GEOCODER } from '../../common/contracts/geocoder.contract';
import { GeoController } from './api/geo.controller';
import { AddressLookupService } from './application/address-lookup.service';
import { PropertyService } from './application/property.service';
import { AdressesQuebecClient } from './infrastructure/adresses-quebec.client';
import { NominatimClient } from './infrastructure/nominatim.client';

/**
 * Module `geo` (B40) — référentiel géographique.
 *
 * - Autocomplétion et résolution d'adresse via Adresses Québec (MRNF).
 * - Fiche propriété depuis le rôle d'évaluation foncière importé
 *   (`property_units`, plateforme-wide, chargé par scripts/geo/import-role.py).
 * - Implémente le contrat `GEOCODER` (`common/contracts/geocoder.contract.ts`)
 *   consommé par `clients` et `dispatch-map` sans import croisé. `@Global()`
 *   pour la même raison que `SystemConfigsModule`.
 */
@Global()
@Module({
  controllers: [GeoController],
  providers: [
    AdressesQuebecClient,
    NominatimClient,
    AddressLookupService,
    PropertyService,
    { provide: GEOCODER, useExisting: AddressLookupService },
  ],
  exports: [GEOCODER],
})
export class GeoModule {}
