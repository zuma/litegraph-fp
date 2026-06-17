import { SchemaDriver } from './types.js';
import { SqliteDriver } from './drivers/sqlite.js';

export * from './types.js';

export const SchemaDrivers: Record<string, SchemaDriver> = {
    'sqlite': SqliteDriver
};

export function getDriver(id: string): SchemaDriver | undefined {
    return SchemaDrivers[id];
}
