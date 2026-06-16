-- SQL script to add dubbed_from_id to stories table
-- Execute this statement in your Supabase SQL Editor to allow saving which music was dubbed in stories.

ALTER TABLE public.stories
ADD COLUMN IF NOT EXISTS dubbed_from_id UUID REFERENCES public.posts(id) ON DELETE SET NULL;
