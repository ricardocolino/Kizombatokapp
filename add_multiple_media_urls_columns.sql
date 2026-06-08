-- SQL para adicionar as duas novas colunas para imagens carrossel (múltiplas postagens)
ALTER TABLE posts ADD COLUMN media_url1 text DEFAULT NULL;
ALTER TABLE posts ADD COLUMN media_url2 text DEFAULT NULL;
