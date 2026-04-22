import type {
  EventBusContract,
  FilePersistenceConfig,
  MemoryPersistenceConfig,
  PersistenceConfig,
  PersistenceProvider,
  RedisPersistenceConfig,
} from '@gortjs/contracts';
import { FilePersistence } from './file-persistence';
import { MemoryPersistence } from './memory-persistence';
import { RedisPersistence } from './redis-persistence';

export function createPersistenceProvider(
  eventBus: EventBusContract,
  config: PersistenceConfig,
): PersistenceProvider {
  const adapter = config.adapter ?? 'file';
  switch (adapter) {
    case 'memory':
      return new MemoryPersistence({
        eventBus,
        config: config as MemoryPersistenceConfig,
      });
    case 'redis':
      return new RedisPersistence({
        eventBus,
        config: config as RedisPersistenceConfig,
      });
    case 'file':
    default:
      return new FilePersistence({
        eventBus,
        config: config as FilePersistenceConfig,
      });
  }
}
