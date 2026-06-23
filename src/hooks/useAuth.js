// =============================================================================
// FILE: src/hooks/useAuth.js
// MỤC ĐÍCH: P3-3 — Supabase OAuth (Google + Facebook) + profile/ELO persistence
//
// LUỒNG:
//   1. Mount → supabase.auth.getSession() để restore session từ localStorage
//   2. Đăng nhập → loginWithGoogle() / loginWithFacebook() → OAuth redirect
//   3. Callback về app → onAuthStateChange fires với event 'SIGNED_IN'
//   4. Hook fetch profile từ bảng `profiles`, nếu chưa có → upsert (trigger SQL handle)
//   5. logout() → supabase.auth.signOut()
//
// RETURN:
//   auth.user        — Supabase user object | null
//   auth.profile     — { id, display_name, elo, avatar_url } | null
//   auth.isLoading   — boolean
//   auth.playerId    — string: user.id nếu logged in, else Guest_XXXX từ localStorage
//   auth.playerName  — string: display_name nếu logged in, else playerId
//   auth.playerElo   — number: elo từ profile, else 1500
//   auth.loginWithGoogle()
//   auth.loginWithFacebook()
//   auth.logout()
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../core/supabaseClient';

// ---------------------------------------------------------------------------
// HELPER: Tạo/lấy guest ID từ localStorage (fallback khi chưa login)
// ---------------------------------------------------------------------------
const getOrCreateGuestId = () => {
  let pid = localStorage.getItem('playerId');
  if (!pid) {
    pid = 'Guest_' + Math.floor(Math.random() * 10000);
    localStorage.setItem('playerId', pid);
  }
  return pid;
};

const GUEST_ID = getOrCreateGuestId();

// ---------------------------------------------------------------------------
// HOOK
// ---------------------------------------------------------------------------
export function useAuth() {
  const [user, setUser]       = useState(null);   // Supabase auth user
  const [profile, setProfile] = useState(null);   // row từ bảng profiles
  const [isLoading, setIsLoading] = useState(true);

  // ─── Fetch profile từ DB ────────────────────────────────────────────────
  const fetchProfile = useCallback(async (userId) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name, elo, avatar_url')
      .eq('id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = row not found (profile chưa được trigger tạo xong)
      console.error('[useAuth] fetchProfile error:', error.message);
    }
    setProfile(data ?? null);
  }, []);

  // ─── Khởi tạo: restore session + subscribe auth changes ────────────────
  useEffect(() => {
    let mounted = true;

    // B4 FIX: Subscribe TRƯỚC getSession() để không miss SIGNED_IN event
    // sau OAuth redirect (Supabase parse hash token trong onAuthStateChange)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;
        const currentUser = session?.user ?? null;
        setUser(currentUser);

        if (event === 'SIGNED_IN' && currentUser) {
          // Upsert profile — đảm bảo row tồn tại (trigger SQL cũng làm việc này)
          await supabase.from('profiles').upsert({
            id: currentUser.id,
            display_name: currentUser.user_metadata?.full_name
                          ?? currentUser.email?.split('@')[0]
                          ?? 'Người chơi',
            avatar_url: currentUser.user_metadata?.avatar_url ?? null,
            // elo KHÔNG ghi đè — default 1500 từ DB hoặc giữ giá trị cũ
          }, { onConflict: 'id', ignoreDuplicates: false });

          await fetchProfile(currentUser.id);
          // Retry sau 1s để fix Google login race condition
          setTimeout(() => { if (mounted) fetchProfile(currentUser.id); }, 1000);
        }

        if (event === 'SIGNED_OUT') {
          setProfile(null);
        }

        // B4 FIX: tắt loading sau bất kỳ auth event nào
        if (mounted) setIsLoading(false);
      }
    );

    // B4 FIX: Xóa hash token khỏi URL sau OAuth redirect (tránh loop + bảo mật)
    if (window.location.hash.includes('access_token')) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }

    // Sau khi subscribe, lấy session hiện tại (nếu đã có từ trước)
    const init = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (mounted && session?.user) {
          setUser(session.user);
          await fetchProfile(session.user.id);
        }
      } catch (e) {
        console.error('[useAuth] getSession error:', e.message);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    init();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  // ─── Subscribe realtime ELO updates (nếu đang online và có match kết thúc) ──
  useEffect(() => {
    if (!user) return;

    const sub = supabase
      .channel(`profile_elo_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${user.id}`,
        },
        (payload) => {
          // ELO vừa được trigger cập nhật sau khi match kết thúc
          setProfile(prev => prev ? { ...prev, elo: payload.new.elo } : null);
        }
      )
      .subscribe();

    return () => supabase.removeChannel(sub);
  }, [user?.id]);

  // ─── Actions ────────────────────────────────────────────────────────────

  const loginWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: { prompt: 'select_account' },
      },
    });
    if (error) console.error('[useAuth] Google login error:', error.message);
  }, []);

  const loginWithFacebook = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'facebook',
      options: { redirectTo: window.location.origin },
    });
    if (error) console.error('[useAuth] Facebook login error:', error.message);
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  // ─── Derived values ─────────────────────────────────────────────────────

  const playerId   = user?.id    ?? GUEST_ID;
  const playerName = profile?.display_name ?? playerId;
  const playerElo  = profile?.elo          ?? 1500;
  const isLoggedIn = user !== null;

  return {
    user,
    profile,
    isLoading,
    playerId,
    playerName,
    playerElo,
    isLoggedIn,
    loginWithGoogle,
    loginWithFacebook,
    logout,
  };
}