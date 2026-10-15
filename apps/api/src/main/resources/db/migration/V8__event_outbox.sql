ALTER TABLE playback_sessions ADD COLUMN playback_state varchar(12) NOT NULL DEFAULT 'STARTED';
CREATE TABLE event_outbox(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),type varchar(100) NOT NULL,aggregate_id varchar(100) NOT NULL,payload jsonb NOT NULL,correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),created_at timestamptz NOT NULL DEFAULT now(),published_at timestamptz,lease_until timestamptz,attempts int NOT NULL DEFAULT 0,available_at timestamptz NOT NULL DEFAULT now(),last_error varchar(200));
CREATE INDEX event_delivery ON event_outbox(available_at) WHERE published_at IS NULL;
CREATE TABLE event_inbox(event_id uuid PRIMARY KEY,type varchar(100) NOT NULL,received_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE event_counts(type varchar(100) PRIMARY KEY,total bigint NOT NULL DEFAULT 0,updated_at timestamptz NOT NULL DEFAULT now());
CREATE FUNCTION emit_vybe_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE data jsonb; event_type text; entity text; body jsonb;
BEGIN
 data := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 entity:=COALESCE(data->>'id',data->>'watchlist_id',data->>'content_id');
 IF TG_TABLE_NAME='media_assets' AND TG_OP='INSERT' THEN event_type:='media.uploaded';body:=jsonb_build_object('assetId',data->'id','contentId',data->'content_id');
 ELSIF TG_TABLE_NAME='processing_jobs' AND TG_OP='UPDATE' AND (to_jsonb(OLD)->>'status') IS DISTINCT FROM (data->>'status') THEN
  event_type:=CASE data->>'status' WHEN 'PROCESSING' THEN 'media.processing.started' WHEN 'READY' THEN 'media.processing.completed' WHEN 'FAILED' THEN 'media.processing.failed' ELSE NULL END;body:=jsonb_build_object('assetId',data->'asset_id','attempts',data->'attempts');
 ELSIF TG_TABLE_NAME='playback_sessions' THEN
  IF TG_OP='INSERT' THEN event_type:='playback.started';ELSIF (to_jsonb(OLD)->>'playback_state') IS DISTINCT FROM (data->>'playback_state') THEN event_type:='playback.'||lower(data->>'playback_state');END IF;
  body:=jsonb_build_object('assetId',data->'asset_id','position',data->'last_position');
 ELSIF TG_TABLE_NAME='watchlist_items' THEN event_type:='watchlist.updated';body:=jsonb_build_object('contentId',data->'content_id','operation',TG_OP);
 ELSIF TG_TABLE_NAME='ratings' THEN event_type:='content.rated';body:=jsonb_build_object('contentId',data->'content_id','score',data->'score');
 END IF;
 IF event_type IS NOT NULL THEN INSERT INTO event_outbox(type,aggregate_id,payload) VALUES(event_type,entity,body);END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $$;
CREATE TRIGGER media_events AFTER INSERT ON media_assets FOR EACH ROW EXECUTE FUNCTION emit_vybe_event();
CREATE TRIGGER processing_events AFTER UPDATE ON processing_jobs FOR EACH ROW EXECUTE FUNCTION emit_vybe_event();
CREATE TRIGGER playback_events AFTER INSERT OR UPDATE ON playback_sessions FOR EACH ROW EXECUTE FUNCTION emit_vybe_event();
CREATE TRIGGER watchlist_events AFTER INSERT OR DELETE ON watchlist_items FOR EACH ROW EXECUTE FUNCTION emit_vybe_event();
CREATE TRIGGER rating_events AFTER INSERT OR UPDATE ON ratings FOR EACH ROW EXECUTE FUNCTION emit_vybe_event();
