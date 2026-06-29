-- Script para adicionar suporte a monetização por views no Supabase

-- 1. Adicionar coluna monetization_status à tabela profiles se não existir
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS monetization_status TEXT DEFAULT 'not_applied';
