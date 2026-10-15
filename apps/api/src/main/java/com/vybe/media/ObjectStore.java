package com.vybe.media;

import io.minio.*;
import java.io.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
public class ObjectStore {
  private final MinioClient client;
  private final String bucket;

  public ObjectStore(
      @Value("${storage.endpoint}") String endpoint,
      @Value("${storage.access-key}") String access,
      @Value("${storage.secret-key}") String secret,
      @Value("${storage.bucket}") String bucket,
      @Value("${storage.region}") String region) {
    this.bucket = bucket;
    this.client =
        MinioClient.builder().endpoint(endpoint).credentials(access, secret).region(region).build();
    client.setTimeout(10000, 120000, 120000);
  }

  public void put(String key, InputStream stream, long size, String type) {
    try {
      client.putObject(
          PutObjectArgs.builder().bucket(bucket).object(key).stream(stream, size, -1)
              .contentType(type)
              .build());
    } catch (Exception e) {
      throw new ResponseStatusException(
          HttpStatus.BAD_GATEWAY, "Object storage could not accept this upload.", e);
    }
  }

  public InputStream get(String key) {
    try {
      return client.getObject(GetObjectArgs.builder().bucket(bucket).object(key).build());
    } catch (Exception e) {
      throw new ResponseStatusException(
          HttpStatus.BAD_GATEWAY, "Media storage is temporarily unavailable.", e);
    }
  }

  public void remove(String key) {
    try {
      client.removeObject(RemoveObjectArgs.builder().bucket(bucket).object(key).build());
    } catch (Exception e) {
      org.slf4j.LoggerFactory.getLogger(getClass()).warn("Object cleanup failed for key {}", key);
    }
  }
}
