-- SQL para adicionar a coluna post_group_id para identificar posts com múltiplas imagens (carrossel) em linhas separadas.
-- Esta nova coluna permite grupar múltiplos posts em uma única publicação na visualização do aplicativo (ex: reels, feeds).

ALTER TABLE posts ADD COLUMN post_group_id UUID DEFAULT NULL;

-- Adiciona um índice na nova coluna para acelerar significativamente as consultas de agrupamento
CREATE INDEX IF NOT EXISTS idx_posts_post_group_id ON posts (post_group_id);
