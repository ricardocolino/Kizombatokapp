-- Script para adicionar suporte a levantamento por IBAN no Supabase

-- 1. Adicionar coluna iban à tabela profiles se não existir
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS iban TEXT;

-- 2. Adicionar coluna iban à tabela withdrawals se não existir
ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS iban TEXT;
