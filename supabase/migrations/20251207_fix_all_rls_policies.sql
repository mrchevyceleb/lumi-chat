-- Fix RLS policies for chats, folders, messages, and personas
-- The original policies only had USING clause, which doesn't apply to INSERT operations
-- This migration drops the old policies and creates proper policies for all operations

-- ============================================
-- CHATS POLICIES
-- ============================================
DROP POLICY IF EXISTS "Users can manage their own chats" ON "public"."chats";

CREATE POLICY "Users can select their own chats" 
  ON "public"."chats" 
  FOR SELECT 
  USING (("auth"."uid"() = "user_id"));

CREATE POLICY "Users can insert their own chats" 
  ON "public"."chats" 
  FOR INSERT 
  WITH CHECK (("auth"."uid"() = "user_id"));

CREATE POLICY "Users can update their own chats" 
  ON "public"."chats" 
  FOR UPDATE 
  USING (("auth"."uid"() = "user_id"))
  WITH CHECK (("auth"."uid"() = "user_id"));

CREATE POLICY "Users can delete their own chats" 
  ON "public"."chats" 
  FOR DELETE 
  USING (("auth"."uid"() = "user_id"));

-- ============================================
-- FOLDERS POLICIES
-- ============================================
DROP POLICY IF EXISTS "Users can manage their own folders" ON "public"."folders";

CREATE POLICY "Users can select their own folders" 
  ON "public"."folders" 
  FOR SELECT 
  USING (("auth"."uid"() = "user_id"));

CREATE POLICY "Users can insert their own folders" 
  ON "public"."folders" 
  FOR INSERT 
  WITH CHECK (("auth"."uid"() = "user_id"));

CREATE POLICY "Users can update their own folders" 
  ON "public"."folders" 
  FOR UPDATE 
  USING (("auth"."uid"() = "user_id"))
  WITH CHECK (("auth"."uid"() = "user_id"));

CREATE POLICY "Users can delete their own folders" 
  ON "public"."folders" 
  FOR DELETE 
  USING (("auth"."uid"() = "user_id"));

-- ============================================
-- MESSAGES POLICIES
-- ============================================
DROP POLICY IF EXISTS "Users can manage their own messages" ON "public"."messages";

CREATE POLICY "Users can select their own messages" 
  ON "public"."messages" 
  FOR SELECT 
  USING (("auth"."uid"() = "user_id"));

CREATE POLICY "Users can insert their own messages" 
  ON "public"."messages" 
  FOR INSERT 
  WITH CHECK (("auth"."uid"() = "user_id"));

CREATE POLICY "Users can update their own messages" 
  ON "public"."messages" 
  FOR UPDATE 
  USING (("auth"."uid"() = "user_id"))
  WITH CHECK (("auth"."uid"() = "user_id"));

CREATE POLICY "Users can delete their own messages" 
  ON "public"."messages" 
  FOR DELETE 
  USING (("auth"."uid"() = "user_id"));

-- ============================================
-- PERSONAS POLICIES
-- ============================================
DROP POLICY IF EXISTS "Users can manage their own personas" ON "public"."personas";

CREATE POLICY "Users can select their own personas" 
  ON "public"."personas" 
  FOR SELECT 
  USING (("auth"."uid"() = "user_id"));

CREATE POLICY "Users can insert their own personas" 
  ON "public"."personas" 
  FOR INSERT 
  WITH CHECK (("auth"."uid"() = "user_id"));

CREATE POLICY "Users can update their own personas" 
  ON "public"."personas" 
  FOR UPDATE 
  USING (("auth"."uid"() = "user_id"))
  WITH CHECK (("auth"."uid"() = "user_id"));

CREATE POLICY "Users can delete their own personas" 
  ON "public"."personas" 
  FOR DELETE 
  USING (("auth"."uid"() = "user_id"));

