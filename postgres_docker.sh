#!/bin/bash

# Configuration
CONTAINER_NAME="gamblebot-postgres"
POSTGRES_USER="gambleuser"
POSTGRES_PASSWORD="gamblepass"
POSTGRES_DB="gambledb"
POSTGRES_PORT=5432
POSTGRES_IMAGE="postgres:15"

# Helper: Check if container exists
container_exists() {
  docker ps -a --format '{{.Names}}' | grep -Eq "^${CONTAINER_NAME} "
}

case "$1" in
  up)
    if container_exists; then
      echo "[INFO] Container already exists. Starting..."
      docker start $CONTAINER_NAME
    else
      echo "[INFO] Creating and starting new container..."
      docker run --name $CONTAINER_NAME \
        -e POSTGRES_USER=$POSTGRES_USER \
        -e POSTGRES_PASSWORD=$POSTGRES_PASSWORD \
        -e POSTGRES_DB=$POSTGRES_DB \
        -p $POSTGRES_PORT:5432 \
        -d $POSTGRES_IMAGE
    fi
    ;;
  down)
    echo "[INFO] Stopping container..."
    docker stop $CONTAINER_NAME
    ;;
  restart)
    echo "[INFO] Restarting container..."
    docker restart $CONTAINER_NAME
    ;;
  psql)
    echo "[INFO] Entering psql shell..."
    docker exec -it $CONTAINER_NAME psql -U $POSTGRES_USER -d $POSTGRES_DB
    ;;
  logs)
    echo "[INFO] Showing logs..."
    docker logs -f $CONTAINER_NAME
    ;;
  remove)
    echo "[INFO] Removing container..."
    docker stop $CONTAINER_NAME
    docker rm $CONTAINER_NAME
    ;;
  status)
    docker ps -a | grep $CONTAINER_NAME
    ;;
  *)
    echo "Usage: $0 {up|down|restart|psql|logs|remove|status}"
    echo "\nDATABASE_URL=postgresql://$POSTGRES_USER:$POSTGRES_PASSWORD@localhost:$POSTGRES_PORT/$POSTGRES_DB"
    ;;
esac
