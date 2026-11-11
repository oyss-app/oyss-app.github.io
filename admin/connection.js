export function publicConfig(value) {
  if(!value || typeof value.url!=='string' || typeof value.key!=='string') throw new Error('Bağlantı bilgisi geçersiz.');
  const url=new URL(value.url.trim()),key=value.key.trim();
  if(url.protocol!=='https:'||!url.hostname.endsWith('.supabase.co')||url.pathname!=='/'||url.search||url.hash||url.username||url.password) throw new Error('Geçerli Supabase proje adresini gir.');
  if(key.startsWith('ey')) {
    const payload=JSON.parse(atob(key.split('.')[1].replaceAll('-','+').replaceAll('_','/')));
    if(payload.role!=='anon') throw new Error('Yalnızca herkese açık anon anahtarı kullanılabilir.');
  } else if(!key.startsWith('sb_publishable_')) throw new Error('Herkese açık anon/publishable anahtarını gir. Gizli anahtar kullanma.');
  return {url:url.origin,key};
}

// Shape validation only. The caller must verify the token with /auth/v1/user.
export function authCallback(hash,now=Math.floor(Date.now()/1000)) {
  const params=new URLSearchParams(hash.replace(/^#/,''));
  if(params.has('error')) throw new Error(params.get('error_description')||'Giriş bağlantısı geçersiz veya süresi dolmuş.');
  if(!params.has('access_token')&&!params.has('refresh_token')) return null;
  const access=params.get('access_token')||'',refresh=params.get('refresh_token')||'',seconds=Number(params.get('expires_in'));
  if(!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(access)||access.length>16384||
    !/^[A-Za-z0-9._~-]{8,8192}$/.test(refresh)||!Number.isFinite(seconds)||seconds<=0||seconds>86400||params.get('token_type')!=='bearer') {
    throw new Error('Giriş bağlantısı eksik veya geçersiz. Yeni bağlantı iste.');
  }
  return {access_token:access,refresh_token:refresh,expires_in:seconds,expires_at:now+seconds,token_type:'bearer'};
}
