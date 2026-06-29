# syntax=docker/dockerfile:1

# --- build stage -----------------------------------------------------------
# Compile a static binary so the runtime image can stay minimal.
FROM golang:1.26-alpine AS build
WORKDIR /src

# Download modules first; this layer is cached until go.mod/go.sum change.
COPY go.mod go.sum ./
RUN go mod download

# Then the source (migrations are embedded into the binary, so no runtime copy).
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/pad ./cmd/pad

# --- runtime stage ---------------------------------------------------------
# Small image, non-root user. busybox wget (in alpine) backs the healthcheck;
# ca-certificates is here for the outbound TLS we'll need once OAuth lands.
FROM alpine:3.20
RUN apk add --no-cache ca-certificates \
 && adduser -D -u 10001 pad
USER pad
COPY --from=build /out/pad /usr/local/bin/pad
EXPOSE 8080
ENTRYPOINT ["pad"]
