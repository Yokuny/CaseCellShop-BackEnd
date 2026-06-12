import { kafka, TOPICS } from "../config";
import { logger } from "../logger";

// Garante que o tópico exista (com líder de partição pronto) antes do producer
// publicar e do consumer assinar — evita o erro "This server does not host this
// topic-partition" causado pela criação preguiçosa do tópico.
export const ensureTopics = async (): Promise<void> => {
  const admin = kafka.admin();
  await admin.connect();
  try {
    await admin.createTopics({
      topics: [{ topic: TOPICS.checkoutRequested, numPartitions: 1, replicationFactor: 1 }],
      waitForLeaders: true,
    });
    logger.info({ topic: TOPICS.checkoutRequested }, "[KAFKA] tópicos garantidos");
  } finally {
    await admin.disconnect();
  }
};
