# Built from the repository root, because it uses the terrain crate next to it:
#   docker build -f backend/Dockerfile .
FROM rust:1-bookworm AS builder
WORKDIR /src
COPY terrain ./terrain
COPY backend ./backend
WORKDIR /src/backend
RUN cargo build --release --locked

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /src/backend/target/release/rsgis ./rsgis
# Map files and DTED terrain are mounted here (see docker-compose.yml).
RUN mkdir -p storage/dted
EXPOSE 7000
CMD ["./rsgis"]
