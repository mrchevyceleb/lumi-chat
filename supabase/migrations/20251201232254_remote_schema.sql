SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;
COMMENT ON SCHEMA "public" IS 'standard public schema';
CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "extensions";
CREATE OR REPLACE FUNCTION "public"."match_documents"("query_embedding" "extensions"."vector", "match_threshold" double precision, "match_count" integer) RETURNS TABLE("id" "uuid", "content" "text", "metadata" "jsonb", "similarity" double precision)
    LANGUAGE "plpgsql"
    AS $$
#variable_conflict use_column
begin
  return query
  select
    id,
    content,
    metadata,
    1 - (documents.embedding <=> query_embedding) as similarity -- Calculate similarity between the question and stored notes
  from documents
  where (1 - (documents.embedding <=> query_embedding)) > match_threshold -- Only include notes that are similar enough
  order by similarity desc -- Show the most similar notes first
  limit match_count; -- Only return the number of notes we asked for
end;
$$;
ALTER FUNCTION "public"."match_documents"("query_embedding" "extensions"."vector", "match_threshold" double precision, "match_count" integer) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."match_documents"("query_embedding" "extensions"."vector", "match_threshold" double precision DEFAULT 0.5, "match_count" integer DEFAULT 5, "filter" "jsonb" DEFAULT '{}'::"jsonb") RETURNS TABLE("id" "uuid", "content" "text", "metadata" "jsonb", "similarity" double precision)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.content,
    d.metadata,
    (1 - (d.embedding <=> query_embedding))::FLOAT AS similarity
  FROM documents d
  WHERE 
    1 - (d.embedding <=> query_embedding) > match_threshold
    AND (filter = '{}' OR d.metadata @> filter)
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
ALTER FUNCTION "public"."match_documents"("query_embedding" "extensions"."vector", "match_threshold" double precision, "match_count" integer, "filter" "jsonb") OWNER TO "postgres";
SET default_tablespace = '';
SET default_table_access_method = "heap";
CREATE TABLE IF NOT EXISTS "public"."chats" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"(),
    "title" "text" NOT NULL,
    "folder_id" "uuid",
    "is_pinned" boolean DEFAULT false,
    "persona_id" "text" NOT NULL,
    "last_updated" bigint DEFAULT (EXTRACT(epoch FROM "now"()) * (1000)::numeric),
    "created_at" timestamp with time zone DEFAULT "now"()
);
ALTER TABLE "public"."chats" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."documents" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "content" "text" NOT NULL,
    "embedding" "extensions"."vector"(768),
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);
ALTER TABLE "public"."documents" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."folders" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"(),
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);
ALTER TABLE "public"."folders" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "chat_id" "uuid" NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"(),
    "role" "text" NOT NULL,
    "content" "text" NOT NULL,
    "timestamp" bigint DEFAULT (EXTRACT(epoch FROM "now"()) * (1000)::numeric),
    "type" "text" DEFAULT 'text'::"text",
    "grounding_urls" "jsonb" DEFAULT '[]'::"jsonb",
    "model" "text",
    CONSTRAINT "messages_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'model'::"text"])))
);
ALTER TABLE "public"."messages" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."personas" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"(),
    "name" "text" NOT NULL,
    "avatar" "text" NOT NULL,
    "system_instruction" "text" NOT NULL,
    "description" "text",
    "color" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);
ALTER TABLE "public"."personas" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."user_usage" (
    "user_id" "uuid" NOT NULL,
    "input_tokens" bigint DEFAULT 0,
    "output_tokens" bigint DEFAULT 0,
    "last_updated" timestamp with time zone DEFAULT "now"(),
    "model_stats" "jsonb" DEFAULT '{}'::"jsonb"
);
ALTER TABLE "public"."user_usage" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."vault_folders" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"(),
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);
ALTER TABLE "public"."vault_folders" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."vault_items" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"(),
    "folder_id" "uuid",
    "content" "text" NOT NULL,
    "source_context" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "is_pinned" boolean DEFAULT false
);
ALTER TABLE "public"."vault_items" OWNER TO "postgres";
ALTER TABLE ONLY "public"."chats"
    ADD CONSTRAINT "chats_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."folders"
    ADD CONSTRAINT "folders_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."personas"
    ADD CONSTRAINT "personas_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."user_usage"
    ADD CONSTRAINT "user_usage_pkey" PRIMARY KEY ("user_id");
ALTER TABLE ONLY "public"."vault_folders"
    ADD CONSTRAINT "vault_folders_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."vault_items"
    ADD CONSTRAINT "vault_items_pkey" PRIMARY KEY ("id");
CREATE INDEX "documents_embedding_idx" ON "public"."documents" USING "hnsw" ("embedding" "extensions"."vector_l2_ops") WITH ("m"='16', "ef_construction"='64');
CREATE INDEX "documents_embedding_idx1" ON "public"."documents" USING "ivfflat" ("embedding" "extensions"."vector_cosine_ops") WITH ("lists"='100');
CREATE INDEX "idx_chats_last_updated" ON "public"."chats" USING "btree" ("last_updated" DESC);
CREATE INDEX "idx_chats_user" ON "public"."chats" USING "btree" ("user_id");
CREATE INDEX "idx_messages_chat" ON "public"."messages" USING "btree" ("chat_id");
ALTER TABLE ONLY "public"."chats"
    ADD CONSTRAINT "chats_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."chats"
    ADD CONSTRAINT "chats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");
ALTER TABLE ONLY "public"."folders"
    ADD CONSTRAINT "folders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");
ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");
ALTER TABLE ONLY "public"."personas"
    ADD CONSTRAINT "personas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");
ALTER TABLE ONLY "public"."user_usage"
    ADD CONSTRAINT "user_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");
ALTER TABLE ONLY "public"."vault_folders"
    ADD CONSTRAINT "vault_folders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."vault_items"
    ADD CONSTRAINT "vault_items_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "public"."vault_folders"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."vault_items"
    ADD CONSTRAINT "vault_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
CREATE POLICY "Users can delete their own vault folders" ON "public"."vault_folders" FOR DELETE USING (("auth"."uid"() = "user_id"));
CREATE POLICY "Users can delete their own vault items" ON "public"."vault_items" FOR DELETE USING (("auth"."uid"() = "user_id"));
CREATE POLICY "Users can insert their own vault folders" ON "public"."vault_folders" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));
CREATE POLICY "Users can insert their own vault items" ON "public"."vault_items" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));
CREATE POLICY "Users can insert/update their own usage" ON "public"."user_usage" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));
CREATE POLICY "Users can manage their own chats" ON "public"."chats" USING (("auth"."uid"() = "user_id"));
CREATE POLICY "Users can manage their own folders" ON "public"."folders" USING (("auth"."uid"() = "user_id"));
CREATE POLICY "Users can manage their own messages" ON "public"."messages" USING (("auth"."uid"() = "user_id"));
CREATE POLICY "Users can manage their own personas" ON "public"."personas" USING (("auth"."uid"() = "user_id"));
CREATE POLICY "Users can update their own vault folders" ON "public"."vault_folders" FOR UPDATE USING (("auth"."uid"() = "user_id"));
CREATE POLICY "Users can update their own vault items" ON "public"."vault_items" FOR UPDATE USING (("auth"."uid"() = "user_id"));
CREATE POLICY "Users can view their own usage" ON "public"."user_usage" FOR SELECT USING (("auth"."uid"() = "user_id"));
CREATE POLICY "Users can view their own vault folders" ON "public"."vault_folders" FOR SELECT USING (("auth"."uid"() = "user_id"));
CREATE POLICY "Users can view their own vault items" ON "public"."vault_items" FOR SELECT USING (("auth"."uid"() = "user_id"));
ALTER TABLE "public"."chats" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."folders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."personas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."user_usage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."vault_folders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."vault_items" ENABLE ROW LEVEL SECURITY;
ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
GRANT ALL ON TABLE "public"."chats" TO "anon";
GRANT ALL ON TABLE "public"."chats" TO "authenticated";
GRANT ALL ON TABLE "public"."chats" TO "service_role";
GRANT ALL ON TABLE "public"."documents" TO "anon";
GRANT ALL ON TABLE "public"."documents" TO "authenticated";
GRANT ALL ON TABLE "public"."documents" TO "service_role";
GRANT ALL ON TABLE "public"."folders" TO "anon";
GRANT ALL ON TABLE "public"."folders" TO "authenticated";
GRANT ALL ON TABLE "public"."folders" TO "service_role";
GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";
GRANT ALL ON TABLE "public"."personas" TO "anon";
GRANT ALL ON TABLE "public"."personas" TO "authenticated";
GRANT ALL ON TABLE "public"."personas" TO "service_role";
GRANT ALL ON TABLE "public"."user_usage" TO "anon";
GRANT ALL ON TABLE "public"."user_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."user_usage" TO "service_role";
GRANT ALL ON TABLE "public"."vault_folders" TO "anon";
GRANT ALL ON TABLE "public"."vault_folders" TO "authenticated";
GRANT ALL ON TABLE "public"."vault_folders" TO "service_role";
GRANT ALL ON TABLE "public"."vault_items" TO "anon";
GRANT ALL ON TABLE "public"."vault_items" TO "authenticated";
GRANT ALL ON TABLE "public"."vault_items" TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
drop extension if exists "pg_net";
