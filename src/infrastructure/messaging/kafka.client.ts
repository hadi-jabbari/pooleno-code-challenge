import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Admin, Consumer, Kafka, Producer, logLevel } from 'kafkajs';
import { loadKafkaConfig } from './kafka.config';

@Injectable()
export class KafkaClientService implements OnModuleDestroy {
  private readonly logger = new Logger(KafkaClientService.name);
  private readonly kafka: Kafka;
  readonly producer: Producer;
  readonly consumer: Consumer;
  readonly topics: { orderAccepted: string; orderDlq: string };
  readonly maxRetries: number;
  readonly retryBaseMs: number;

  private producerConnected = false;
  private consumerConnected = false;
  private topicsEnsured = false;

  constructor(configService: ConfigService) {
    const cfg = loadKafkaConfig({
      KAFKA_BROKERS: configService.get<string>('KAFKA_BROKERS'),
      KAFKA_CLIENT_ID: configService.get<string>('KAFKA_CLIENT_ID'),
      KAFKA_GROUP_ID: configService.get<string>('KAFKA_GROUP_ID'),
      KAFKA_TOPIC_ORDER_ACCEPTED: configService.get<string>('KAFKA_TOPIC_ORDER_ACCEPTED'),
      KAFKA_TOPIC_ORDER_DLQ: configService.get<string>('KAFKA_TOPIC_ORDER_DLQ'),
      CONSUMER_MAX_RETRIES: configService.get<string>('CONSUMER_MAX_RETRIES'),
      CONSUMER_RETRY_BASE_MS: configService.get<string>('CONSUMER_RETRY_BASE_MS'),
    } as NodeJS.ProcessEnv);

    this.topics = {
      orderAccepted: cfg.orderAcceptedTopic,
      orderDlq: cfg.orderDlqTopic,
    };
    this.maxRetries = cfg.maxRetries;
    this.retryBaseMs = cfg.retryBaseMs;

    this.kafka = new Kafka({
      clientId: cfg.clientId,
      brokers: cfg.brokers,
      logLevel: logLevel.WARN,
      retry: { retries: 8 },
    });

    this.producer = this.kafka.producer({ allowAutoTopicCreation: true });
    this.consumer = this.kafka.consumer({
      groupId: cfg.groupId,
      allowAutoTopicCreation: true,
      sessionTimeout: 30_000,
    });
  }

  async ensureTopics(): Promise<void> {
    if (this.topicsEnsured) {
      return;
    }

    const admin: Admin = this.kafka.admin();
    try {
      await admin.connect();
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        try {
          const existing = await admin.listTopics();
          const toCreate = [this.topics.orderAccepted, this.topics.orderDlq].filter(
            (t) => !existing.includes(t),
          );
          if (toCreate.length > 0) {
            await admin.createTopics({
              waitForLeaders: true,
              topics: toCreate.map((topic) => ({
                topic,
                numPartitions: 3,
                replicationFactor: 1,
              })),
            });
            this.logger.log(`Created Kafka topics: ${toCreate.join(', ')}`);
          }
          this.topicsEnsured = true;
          return;
        } catch (error) {
          this.logger.warn(
            `Topic ensure attempt ${attempt}/5 failed: ${String(error)}`,
          );
          await sleep(1000 * attempt);
        }
      }
      this.logger.warn('Continuing without explicit topic creation (auto-create may apply)');
    } finally {
      try {
        await admin.disconnect();
      } catch {
        // ignore
      }
    }
  }

  async connectProducer(): Promise<void> {
    if (this.producerConnected) {
      return;
    }
    await this.ensureTopics();
    await this.producer.connect();
    this.producerConnected = true;
    this.logger.log('Kafka producer connected');
  }

  async connectConsumer(): Promise<void> {
    if (this.consumerConnected) {
      return;
    }
    await this.ensureTopics();
    await this.consumer.connect();
    this.consumerConnected = true;
    this.logger.log('Kafka consumer connected');
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Shutting down Kafka clients...');
    try {
      if (this.consumerConnected) {
        await this.consumer.disconnect();
      }
    } catch (error) {
      this.logger.warn(`Consumer disconnect error: ${String(error)}`);
    }
    try {
      if (this.producerConnected) {
        await this.producer.disconnect();
      }
    } catch (error) {
      this.logger.warn(`Producer disconnect error: ${String(error)}`);
    }
  }

  isHealthy(): boolean {
    return this.producerConnected || this.consumerConnected;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
