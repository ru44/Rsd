# Build stage
FROM rust:1.88 AS builder

WORKDIR /app

# Install ca-certificates and update them
RUN apt-get update && apt-get install -y ca-certificates && update-ca-certificates

COPY . .

RUN cargo build --release

# Runtime stage
FROM debian:latest

RUN apt-get update && apt-get install -y libsqlite3-0 ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy compiled binary
COPY --from=builder /app/target/release/rsgis ./rsgis

# Copy MBTiles and other static files
COPY storage ./storage

EXPOSE 7000
CMD ["./rsgis"]