
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cxvqbhcrlpedvhvrqddx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_JQPomQaK71IzMmCfGmSs2A_qPSwpxJW';

// This is a dummy key as requested by instructions (assume pre-configured)
// but using the provided public key from user request.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export function groupPostsByGroupId<T extends { id: string; post_group_id?: string | null; media_url: string; media_url1?: string | null; media_url2?: string | null; created_at: string }>(rawPosts: T[]): T[] {
  const grouped: T[] = [];
  const groupMap = new Map<string, T[]>();

  for (const post of rawPosts) {
    if (post.post_group_id) {
      if (!groupMap.has(post.post_group_id)) {
        groupMap.set(post.post_group_id, []);
      }
      groupMap.get(post.post_group_id)!.push(post);
    } else {
      grouped.push(post);
    }
  }

  // Para cada grupo de posts com o mesmo post_group_id
  for (const [_, groupPostsList] of groupMap.entries()) {
    if (groupPostsList.length === 0) continue;
    
    // Ordena pelo criados_at crescente para manter a ordem exata em que foram enviados
    groupPostsList.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    
    const master = { ...groupPostsList[0] };
    const mediaUrls = groupPostsList.map(p => p.media_url);
    
    master.media_url = mediaUrls[0];
    if (mediaUrls.length > 1) {
      master.media_url1 = mediaUrls[1];
    }
    if (mediaUrls.length > 2) {
      master.media_url2 = mediaUrls[2];
    }
    // Suporte para mais imagens colocando-as em listas temporárias se o front necessitar
    if (mediaUrls.length > 3) {
      (master as any).all_media_urls = mediaUrls;
    }
    
    grouped.push(master);
  }

  // Reordena o resultado final para manter a timeline coerente (is_ready primeiro, depois created_at decrescente)
  grouped.sort((a, b) => {
    const isReadyA = (a as any).is_ready ? 1 : 0;
    const isReadyB = (b as any).is_ready ? 1 : 0;
    if (isReadyA !== isReadyB) {
      return isReadyB - isReadyA;
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return grouped;
}

