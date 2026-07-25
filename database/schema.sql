CREATE DATABASE IF NOT EXISTS xliff_translator
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE xliff_translator;

CREATE TABLE IF NOT EXISTS translation_jobs (
  id CHAR(36) PRIMARY KEY,
  original_filename VARCHAR(512) NOT NULL,
  output_filename VARCHAR(512) NULL,
  source_language VARCHAR(64) NULL,
  target_language VARCHAR(64) NOT NULL DEFAULT 'de',
  xliff_version VARCHAR(16) NULL,
  total_segments INT NOT NULL DEFAULT 0,
  translated_segments INT NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'uploaded',
  error_message TEXT NULL,
  upload_path VARCHAR(1024) NULL,
  output_path VARCHAR(1024) NULL,
  source_only_output_path VARCHAR(1024) NULL,
  file_size BIGINT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  INDEX idx_jobs_status (status),
  INDEX idx_jobs_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS translation_segments (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  translation_job_id CHAR(36) NOT NULL,
  segment_identifier VARCHAR(255) NOT NULL,
  source_text MEDIUMTEXT NOT NULL,
  translated_text MEDIUMTEXT NULL,
  validation_status VARCHAR(32) NOT NULL DEFAULT 'pending',
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_segments_job
    FOREIGN KEY (translation_job_id)
    REFERENCES translation_jobs(id)
    ON DELETE CASCADE,
  INDEX idx_segments_job (translation_job_id),
  INDEX idx_segments_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS app_settings (
    id TINYINT PRIMARY KEY DEFAULT 1,
    provider ENUM('gemini', 'anthropic') NOT NULL,
    model VARCHAR(150) NOT NULL,
    api_key TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    CHECK (id = 1)
) ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;

-- Migration: add source_only_output_path column (run once on existing databases)
ALTER TABLE translation_jobs
  ADD COLUMN IF NOT EXISTS source_only_output_path VARCHAR(1024) NULL
  AFTER output_path;
