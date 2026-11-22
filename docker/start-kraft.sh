#!/usr/bin/env bash
set -euo pipefail

: "${KAFKA_LISTENERS:=PLAINTEXT://:9092,CONTROLLER://:9093}"
: "${KAFKA_ADVERTISED_LISTENERS:=PLAINTEXT://localhost:9094}"
: "${KAFKA_LISTENER_SECURITY_PROTOCOL_MAP:=PLAINTEXT:PLAINTEXT,CONTROLLER:PLAINTEXT}"
: "${KAFKA_INTER_BROKER_LISTENER_NAME:=PLAINTEXT}"

CONFIG=/tmp/kraft/server.properties
mkdir -p /tmp/kraft
export LOG_DIR=/tmp/kraft/app-logs

cat > "${CONFIG}" <<EOF
process.roles=broker,controller
node.id=1
controller.quorum.voters=1@localhost:9093
controller.listener.names=CONTROLLER
listeners=${KAFKA_LISTENERS}
advertised.listeners=${KAFKA_ADVERTISED_LISTENERS}
listener.security.protocol.map=${KAFKA_LISTENER_SECURITY_PROTOCOL_MAP}
inter.broker.listener.name=${KAFKA_INTER_BROKER_LISTENER_NAME}
log.dirs=/tmp/kraft/logs
num.partitions=3
offsets.topic.replication.factor=1
transaction.state.log.replication.factor=1
transaction.state.log.min.isr=1
group.initial.rebalance.delay.ms=0
auto.create.topics.enable=true
EOF

/opt/kafka/bin/kafka-storage.sh format --ignore-formatted \
  --cluster-id "$(/opt/kafka/bin/kafka-storage.sh random-uuid)" --config "${CONFIG}"
exec /opt/kafka/bin/kafka-server-start.sh "${CONFIG}"
