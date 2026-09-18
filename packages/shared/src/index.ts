// Point d'entrée de @taskmgr/shared. Tout ce qui est exporté ici doit rester
// sans UI, sans React et sans dépendance au DOM : le package est consommé en
// source par Metro (mobile) et plus tard par Vite (frontend).

export * from './contracts/errors';
export * from './utils/phone';
export * from './contracts/api';
export * from './utils/navigation';
export * from './contracts/sync';
export * from './process/resolve-available-transitions';
