import { Module } from '@nestjs/common';
import { ClientsController } from './clients.controller';
import { ClientsCsvController } from './clients-csv.controller';
import { ClientsService } from './clients.service';
import { ExternalClientService } from './external-client.service';

/**
 * Module Clients — gère deux sources de données :
 *  1. Clients enrichis (modèle Client V3) → PrismaService (base locale, CRUD complet + adresses multiples)
 *  2. Clients externes                    → pg Pool (base distante, READ ONLY, utilisé dans searchUnified)
 *
 * PrismaModule est @Global() donc PrismaService est injecté automatiquement.
 * ConfigModule est @Global() donc ConfigService est injecté automatiquement.
 */
@Module({
  controllers: [ClientsController, ClientsCsvController],
  providers: [ClientsService, ExternalClientService],
  exports: [ClientsService, ExternalClientService],
})
export class ClientsModule {}
