# Development storage matching the locally verified S3rver fixture.
FROM node:24-alpine
RUN npm install -g s3rver@3.7.1 && mkdir /data && chown node:node /data
USER node
CMD ["s3rver", "--directory", "/data", "--port", "9000", "--address", "0.0.0.0", "--no-vhost-buckets"]
