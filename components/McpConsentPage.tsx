import React, { useEffect, useState } from 'react';
import { Loader2, AlertCircle, CheckCircle, Shield, X } from 'lucide-react';
import { getSupabase } from '../services/supabaseClient';

interface PendingAuth {
  client_id: string;
  client_name: string;
  redirect_uri: string;
  scope: string[];
}

const SCOPE_DESCRIPTIONS: Record<string, { label: string; desc: string }> = {
  'banners:read':  { label: 'Đọc banners',         desc: 'Xem banner đã tạo, ảnh, metadata' },
  'banners:write': { label: 'Tạo / sửa banners',   desc: 'Generate banner mới, clone, variations' },
  'drafts:read':   { label: 'Đọc creative drafts', desc: 'Xem các creative đang draft trong app' },
  'drafts:write':  { label: 'Lưu creative drafts', desc: 'Lưu creative mới hoặc cập nhật draft' },
  'brand:read':    { label: 'Đọc brand styles',    desc: 'Xem brand profile (logo, color, voice)' },
};

export const McpConsentPage: React.FC = () => {
  const [pending, setPending] = useState<PendingAuth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [grantedScopes, setGrantedScopes] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState<'allow' | 'deny' | null>(null);

  // 1. Load pending authorization from cookie (set by /api/mcp/authorize)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/mcp/pending', { credentials: 'include' });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error_description || `HTTP ${res.status}`);
        }
        const p: PendingAuth = await res.json();
        setPending(p);
        setGrantedScopes(new Set(p.scope));
      } catch (e: any) {
        setError(e?.message || 'Không tải được pending authorization');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const submit = async (decision: 'allow' | 'deny') => {
    setSubmitting(decision);
    setError(null);
    try {
      const { data: { session } } = await getSupabase().auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Chưa đăng nhập — login lại rồi thử');

      const res = await fetch('/api/mcp/approve', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          decision,
          scope: Array.from(grantedScopes),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error_description || `HTTP ${res.status}`);
      }
      const body = await res.json();
      if (body.redirect) {
        // Hand control back to the MCP client.
        window.location.href = body.redirect;
      } else {
        setError('Server không trả về redirect URL');
        setSubmitting(null);
      }
    } catch (e: any) {
      setError(e?.message || 'Submit lỗi');
      setSubmitting(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <Loader2 size={32} className="animate-spin text-muted" />
      </div>
    );
  }

  if (error || !pending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas p-4">
        <div className="max-w-md w-full bg-surface border border-line rounded-2xl p-6 space-y-3">
          <div className="flex items-center gap-2 text-danger">
            <AlertCircle size={20} />
            <h1 className="text-lg font-semibold">Không thể tiếp tục</h1>
          </div>
          <p className="text-sm text-muted leading-relaxed">{error || 'Không tìm thấy yêu cầu authorization. Có thể đã hết hạn (10 phút) — quay lại Claude Desktop và bấm Connect lại.'}</p>
          <button
            onClick={() => window.location.href = '/'}
            className="text-sm px-4 py-2 rounded-lg bg-canvas border border-line hover:bg-raised text-fg"
          >
            Về trang chủ
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas p-4">
      <div className="max-w-md w-full bg-surface border border-line rounded-2xl shadow-2xl overflow-hidden">
        <header className="px-6 py-4 border-b border-line bg-canvas flex items-center gap-3">
          <div className="bg-brand text-white p-2 rounded-lg">
            <Shield size={18} />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-fg">Cấp quyền truy cập</h1>
            <p className="text-xs text-muted truncate">Banner Ads Pro MCP</p>
          </div>
        </header>

        <div className="p-6 space-y-4">
          <div className="text-sm text-fg leading-relaxed">
            <span className="font-semibold">{pending.client_name}</span> muốn kết nối với tài khoản Banner Ads Pro của bạn.
          </div>

          <div className="space-y-2">
            <p className="text-xs font-mono uppercase tracking-wider text-muted">Quyền yêu cầu</p>
            <div className="space-y-1.5 border border-line rounded-lg divide-y divide-line">
              {pending.scope.map(s => {
                const info = SCOPE_DESCRIPTIONS[s] || { label: s, desc: '(custom scope)' };
                const granted = grantedScopes.has(s);
                return (
                  <label key={s} className="flex items-start gap-3 p-3 cursor-pointer hover:bg-canvas/40">
                    <input
                      type="checkbox"
                      checked={granted}
                      onChange={(e) => {
                        setGrantedScopes(prev => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(s);
                          else next.delete(s);
                          return next;
                        });
                      }}
                      className="mt-0.5 accent-brand"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-fg font-medium">{info.label}</p>
                      <p className="text-xs text-muted mt-0.5">{info.desc}</p>
                      <p className="text-[10px] text-subtle font-mono mt-0.5">{s}</p>
                    </div>
                  </label>
                );
              })}
            </div>
            <p className="text-[11px] text-subtle">
              Bỏ tick để revoke một quyền cụ thể. Token có thể thu hồi bất kỳ lúc nào từ Settings → Connected apps.
            </p>
          </div>

          <div className="text-[11px] text-subtle bg-canvas/40 p-3 rounded-lg border border-line/50 font-mono break-all">
            Redirect sau OK: {pending.redirect_uri}
          </div>
        </div>

        <footer className="px-6 py-4 border-t border-line bg-canvas flex items-center justify-end gap-2">
          <button
            onClick={() => submit('deny')}
            disabled={submitting !== null}
            className="text-sm px-4 py-2 rounded-lg bg-canvas border border-line hover:bg-raised text-muted disabled:opacity-50 flex items-center gap-1.5"
          >
            {submitting === 'deny' ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
            Từ chối
          </button>
          <button
            onClick={() => submit('allow')}
            disabled={submitting !== null || grantedScopes.size === 0}
            className="text-sm px-4 py-2 rounded-lg bg-brand hover:bg-brand-dark text-white font-semibold flex items-center gap-1.5 disabled:opacity-50"
          >
            {submitting === 'allow' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
            Cho phép ({grantedScopes.size} quyền)
          </button>
        </footer>
      </div>
    </div>
  );
};
