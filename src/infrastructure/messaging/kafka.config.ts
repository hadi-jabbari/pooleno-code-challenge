export interface KafkaAppConfig {
  brokers: string[];
  clientId: string;
  groupId: string;
  orderAcceptedTopic: string;
  orderDlqTopic: string;
  maxRetries: number;
  retryBaseMs: number;
}

export function loadKafkaConfig(env: NodeJS.ProcessEnv = process.env): KafkaAppConfig {
  return {
    brokers: (env.KAFKA_BROKERS ?? 'localhost:9092').split(',').map((b) => b.trim()),
    clientId: env.KAFKA_CLIENT_ID ?? 'pooleno-order-service',
    groupId: env.KAFKA_GROUP_ID ?? 'pooleno-order-processors',
    orderAcceptedTopic: env.KAFKA_TOPIC_ORDER_ACCEPTED ?? 'order.accepted',
    orderDlqTopic: env.KAFKA_TOPIC_ORDER_DLQ ?? 'order.accepted.dlq',
    maxRetries: Number(env.CONSUMER_MAX_RETRIES ?? 3),
    retryBaseMs: Number(env.CONSUMER_RETRY_BASE_MS ?? 200),
  };
}
