import React, { useEffect, useRef, useState } from 'react';
import {
  X, User as UserIcon, Key, Sparkles, ExternalLink, Eye, EyeOff, CheckCircle,
  Loader2, Camera, ChevronDown, ChevronRight, Save, Edit3, Megaphone, Plus,
  Trash2, Star, AlertCircle, HardDrive,
} from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import {
  getCoachioApiKey, setCoachioApiKey, removeCoachioApiKey, validateCoachioApiKey,
} from '../services/coachioService';
import {
  getGeminiApiKey, setGeminiApiKey, removeGeminiApiKey,
} from '../services/storageService';
import { getSupabase } from '../services/supabaseClient';
import { uploadToBunny } from '../services/bunnyService';
import { compressForUpload } from '../services/imageUtils';
import { MetaAccount } from '../types';
import {
  listMetaAccountsFromCloud, saveMetaAccountToCloud, deleteMetaAccountFromCloud,
  newMetaAccountDraft, validateMetaAccount, MetaAccountsSetupRequiredError,
} from '../services/metaAccountsService';
import {
  inventoryLocalStorage, clearGroups, formatBytes, StorageReport, StorageGroupId,
} from '../services/storageCleanupService';

type SettingsTab = 'profile' | 'keys' | 'meta' | 'storage';

interface Props {
  user?: User;
  onClose: () => void;
  /** which tab to open by default */
  initialTab?: SettingsTab;
}

const maskKey = (key: string) => key ? key.slice(0, 6) + '…' + key.slice(-4) : '';

export const ProfileSettingsModal: React.FC<Props> = ({ user, onClose, initialTab }) => {
  const [tab, setTab] = useState<SettingsTab>(initialTab || 'profile');

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-canvas border border-line rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 py-3 border-b border-line bg-surface/60">
          <div className="flex items-center gap-3">
            <div className="bg-brand/15 text-brand p-2 rounded-md border border-brand/30">
              <UserIcon size={16} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-fg">Hồ sơ & Cài đặt</h3>
              <p className="text-[11px] text-subtle">Avatar, thông tin cơ bản, API keys</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-md hover:bg-raised text-muted hover:text-fg">
            <X size={16} />
          </button>
        </header>

        <div className="border-b border-line bg-surface/30 px-5">
          <div className="flex gap-1">
            {([
              { id: 'profile' as const, label: 'Hồ sơ',         icon: <UserIcon size={12} /> },
              { id: 'keys' as const,    label: 'API Keys',      icon: <Key size={12} /> },
              { id: 'meta' as const,    label: 'Meta Accounts', icon: <Megaphone size={12} /> },
              { id: 'storage' as const, label: 'Lưu trữ',       icon: <HardDrive size={12} /> },
            ] as { id: SettingsTab; label: string; icon: React.ReactNode }[]).map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`text-xs px-3 py-2 border-b-2 transition-colors flex items-center gap-1.5 ${
                  tab === t.id ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-fg'
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'profile' && <ProfileSection user={user} />}
          {tab === 'keys'    && <KeysSection />}
          {tab === 'meta'    && <MetaAccountsSection />}
          {tab === 'storage' && <StorageSection />}
        </div>
      </div>
    </div>
  );
};

// ────────────── Profile ──────────────

const ProfileSection: React.FC<{ user?: User }> = ({ user }) => {
  const initialDisplay = (user?.user_metadata?.display_name as string) || '';
  const initialAvatar = (user?.user_metadata?.avatar_url as string) || '';
  const [displayName, setDisplayName] = useState(initialDisplay);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatar);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const dirty = displayName !== initialDisplay || avatarUrl !== initialAvatar;

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      const { error } = await getSupabase().auth.updateUser({
        data: { display_name: displayName.trim() || undefined, avatar_url: avatarUrl || undefined },
      });
      if (error) throw error;
      setSavedAt(Date.now());
    } catch (e: any) {
      setError(e?.message || 'Lưu profile lỗi');
    } finally {
      setSaving(false);
    }
  };

  const handleFile = async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      // Try Bunny upload first (production). If /api/upload returns 404
      // (Vite dev mode without `vercel dev`), fall back to a compressed base64
      // data URL so avatar still works locally without server infra.
      try {
        const res = await uploadToBunny(file, 'misc');
        setAvatarUrl(res.url);
      } catch (uploadErr: any) {
        const msg = String(uploadErr?.message || '');
        const looksLike404 = msg.includes('404') || msg.toLowerCase().includes('not found');
        if (!looksLike404) throw uploadErr;
        // Fallback: aggressively compress to a tiny base64 avatar so it fits
        // in Supabase user_metadata without a CDN.
        const { dataUrl } = await compressForUpload(file, 256, 0.7);
        setAvatarUrl(dataUrl);
      }
    } catch (e: any) {
      setError(`Upload avatar lỗi: ${e?.message || e}`);
    } finally {
      setUploading(false);
    }
  };

  const initial = (displayName || user?.email || '?').slice(0, 1).toUpperCase();

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <div className="relative">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="w-20 h-20 rounded-full object-cover border-2 border-line" />
          ) : (
            <div className="w-20 h-20 rounded-full bg-brand/15 text-brand flex items-center justify-center text-2xl font-bold border-2 border-line">
              {initial}
            </div>
          )}
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="absolute -bottom-1 -right-1 bg-brand hover:bg-brand-dark text-white p-1.5 rounded-full shadow-pop disabled:opacity-50"
            title="Đổi avatar"
          >
            {uploading ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-semibold text-fg truncate">{displayName || user?.email?.split('@')[0]}</p>
          <p className="text-xs text-subtle truncate">{user?.email}</p>
          <p className="text-[10px] text-muted mt-0.5 font-mono">{user?.id?.slice(0, 8)}</p>
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-muted block mb-1.5">Tên hiển thị</label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="VD: Sơn từ Coachio"
          className="w-full bg-canvas border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-muted block mb-1.5">Email</label>
        <input
          type="email"
          value={user?.email || ''}
          readOnly
          className="w-full bg-raised border border-line rounded-md px-3 py-2 text-sm text-muted cursor-not-allowed"
        />
        <p className="text-xs text-muted mt-1">Email được Supabase quản lý, không sửa trực tiếp ở đây.</p>
      </div>

      {error && (
        <div className="status-danger border text-sm px-3 py-2 rounded-lg">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="text-sm bg-brand hover:bg-brand-dark disabled:bg-raised disabled:text-subtle text-white px-4 py-2 rounded-lg font-medium flex items-center gap-1.5"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Lưu hồ sơ
        </button>
        {savedAt && !dirty && (
          <span className="text-sm text-success flex items-center gap-1">
            <CheckCircle size={14} /> Đã lưu
          </span>
        )}
      </div>
    </div>
  );
};

// ────────────── API Keys ──────────────

const KeysSection: React.FC = () => {
  const [showGoogle, setShowGoogle] = useState(false);
  const [showCoachio, setShowCoachio] = useState(false);

  const googleSaved = !!getGeminiApiKey();
  const coachioSaved = !!getCoachioApiKey();

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-subtle">
        Sau khi bấm <span className="text-fg font-semibold">Lưu</span>, box sẽ tự thu lại.
        Bấm vào tiêu đề để mở lại sửa key.
      </p>

      <KeyCard
        accent="indigo"
        title="Google Gemini"
        subtitle="Gemini backend cho banner generation"
        helpUrl="https://aistudio.google.com/apikey"
        helpLabel="Lấy key từ AI Studio"
        savedBadge={googleSaved}
        expanded={showGoogle}
        onToggle={() => setShowGoogle(s => !s)}
      >
        <GeminiForm onSaved={() => setShowGoogle(false)} />
      </KeyCard>

      <KeyCard
        accent="orange"
        title="Coachio AI"
        subtitle="Image generation + LLM chat (Studio)"
        helpUrl="https://studio.coachio.ai/"
        helpLabel="Mở Coachio Studio"
        savedBadge={coachioSaved}
        expanded={showCoachio}
        onToggle={() => setShowCoachio(s => !s)}
      >
        <CoachioForm onSaved={() => setShowCoachio(false)} />
      </KeyCard>
    </div>
  );
};

const KeyCard: React.FC<{
  accent: 'indigo' | 'orange';
  title: string;
  subtitle: string;
  helpUrl: string;
  helpLabel: string;
  savedBadge: boolean;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}> = ({ accent, title, subtitle, helpUrl, helpLabel, savedBadge, expanded, onToggle, children }) => {
  void accent;
  return (
    <div className="border border-line rounded-xl overflow-hidden bg-surface">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-raised transition-colors"
      >
        <div className="p-2 rounded-lg bg-brand text-white">
          <Sparkles size={14} />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm font-semibold text-fg flex items-center gap-2">
            {title}
            {savedBadge && <span className="text-xs status-success border px-2 py-0.5 rounded-md font-medium">đã lưu</span>}
          </p>
          <p className="text-sm text-muted">{subtitle}</p>
        </div>
        {expanded ? <ChevronDown size={16} className="text-muted" /> : <ChevronRight size={16} className="text-muted" />}
      </button>
      {expanded && (
        <div className="border-t border-line p-4 space-y-3">
          <a
            href={helpUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-brand hover:underline inline-flex items-center gap-1"
          >
            {helpLabel} <ExternalLink size={10} />
          </a>
          {children}
        </div>
      )}
    </div>
  );
};

const GeminiForm: React.FC<{ onSaved: () => void }> = ({ onSaved }) => {
  const [key, setKey] = useState(getGeminiApiKey());
  const [show, setShow] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const save = () => {
    if (!key.trim()) return;
    setGeminiApiKey(key.trim());
    setSavedFlash(true);
    setTimeout(() => { setSavedFlash(false); onSaved(); }, 400);
  };

  const remove = () => {
    removeGeminiApiKey();
    setKey('');
  };

  return (
    <>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="AIzaSy..."
          className="w-full bg-canvas border border-line rounded-lg px-3 py-2.5 pr-10 text-sm font-mono focus:outline-none focus:border-brand"
        />
        <button
          onClick={() => setShow(!show)}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-fg"
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {key && (
        <p className="text-xs font-mono text-muted">Hiện tại: {maskKey(key)}</p>
      )}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={save}
          disabled={!key.trim() || savedFlash}
          className="text-sm bg-brand hover:bg-brand-dark disabled:opacity-50 text-white px-3 py-2 rounded-lg flex items-center gap-1.5 font-medium"
        >
          {savedFlash ? <CheckCircle size={14} /> : <Save size={14} />}
          {savedFlash ? 'Đã lưu' : 'Lưu key'}
        </button>
        {key && (
          <button
            onClick={remove}
            className="text-sm text-danger hover:bg-danger-soft px-3 py-2 rounded-lg border border-line"
          >
            Xoá
          </button>
        )}
      </div>
    </>
  );
};

const CoachioForm: React.FC<{ onSaved: () => void }> = ({ onSaved }) => {
  const [key, setKey] = useState(getCoachioApiKey());
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');
  const [savedFlash, setSavedFlash] = useState(false);

  const validate = async () => {
    if (!key.trim()) return;
    setStatus('validating');
    const ok = await validateCoachioApiKey(key.trim());
    setStatus(ok ? 'valid' : 'invalid');
  };

  const save = () => {
    if (!key.trim()) return;
    setCoachioApiKey(key.trim());
    setSavedFlash(true);
    setTimeout(() => { setSavedFlash(false); onSaved(); }, 400);
  };

  const remove = () => {
    removeCoachioApiKey();
    setKey('');
    setStatus('idle');
  };

  return (
    <>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={key}
          onChange={(e) => { setKey(e.target.value); setStatus('idle'); }}
          placeholder="lv_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
          className="w-full bg-canvas border border-line rounded-lg px-3 py-2.5 pr-10 text-sm font-mono focus:outline-none focus:border-brand"
        />
        <button
          onClick={() => setShow(!show)}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-fg"
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {key && (
        <p className="text-xs font-mono text-muted">Hiện tại: {maskKey(key)}</p>
      )}
      {status !== 'idle' && (
        <div className={`text-sm flex items-center gap-1.5 px-3 py-2 rounded-lg border ${
          status === 'validating' ? 'status-info' :
          status === 'valid'      ? 'status-success' :
                                    'status-danger'
        }`}>
          {status === 'validating' && <><Loader2 size={14} className="animate-spin" /> Đang validate...</>}
          {status === 'valid' && <><CheckCircle size={14} /> Key hợp lệ</>}
          {status === 'invalid' && <><X size={14} /> Key sai hoặc hết credit</>}
        </div>
      )}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={save}
          disabled={!key.trim() || savedFlash}
          className="text-sm bg-brand hover:bg-brand-dark disabled:opacity-50 text-white px-3 py-2 rounded-lg flex items-center gap-1.5 font-medium"
        >
          {savedFlash ? <CheckCircle size={14} /> : <Save size={14} />}
          {savedFlash ? 'Đã lưu' : 'Lưu key'}
        </button>
        <button
          onClick={validate}
          disabled={!key.trim() || status === 'validating'}
          className="text-sm bg-canvas hover:bg-raised text-fg px-3 py-2 rounded-lg border border-line-strong disabled:opacity-50 font-medium"
        >
          Test key
        </button>
        {key && (
          <button
            onClick={remove}
            className="text-sm text-danger hover:bg-danger-soft px-3 py-2 rounded-lg border border-line"
          >
            Xoá
          </button>
        )}
      </div>
    </>
  );
};

// ────────────── Meta Accounts ──────────────

const MetaAccountsSection: React.FC = () => {
  const [accounts, setAccounts] = useState<MetaAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<MetaAccount | null>(null);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await listMetaAccountsFromCloud();
      setAccounts(data);
    } catch (e: any) {
      if (e instanceof MetaAccountsSetupRequiredError) setSetupNeeded(true);
      else setError(e?.message || 'Tải Meta Accounts lỗi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const handleDelete = async (a: MetaAccount) => {
    if (!confirm(`Xoá Meta Account "${a.label}"? Campaign nào đang trỏ vào sẽ mất link.`)) return;
    try {
      await deleteMetaAccountFromCloud(a.id);
      await refresh();
    } catch (e: any) {
      setError(e?.message || 'Xoá lỗi');
    }
  };

  if (loading) {
    return (
      <div className="py-12 text-center text-muted">
        <Loader2 className="animate-spin mx-auto" size={20} />
      </div>
    );
  }

  if (setupNeeded) {
    return (
      <div className="status-warning border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <AlertCircle size={16} />
          <p className="text-base font-semibold text-fg">Cần chạy SQL setup trước</p>
        </div>
        <p className="text-sm">
          Bảng <code className="bg-canvas text-fg px-1.5 py-0.5 rounded font-mono">meta_accounts</code> chưa tồn tại.
          File SQL đầy đủ ở <code className="bg-canvas text-fg px-1.5 py-0.5 rounded font-mono">db/setup.sql</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted leading-relaxed">
        Cấu hình một lần — Ad Account + Page (+ Instagram). Mọi campaign sau chỉ pick từ list này.
        Đặt 1 cái làm default — wizard tự chọn.
      </p>

      {error && (
        <div className="status-danger border text-sm px-3 py-2 rounded-lg">
          {error}
        </div>
      )}

      <div className="space-y-2">
        {accounts.map(a => (
          <div key={a.id} className="bg-surface border border-line rounded-xl p-3 flex items-start gap-3">
            <div className="bg-brand text-white p-2 rounded-lg shrink-0">
              <Megaphone size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-fg truncate">{a.label}</p>
                {a.isDefault && (
                  <span className="text-xs status-success border px-2 py-0.5 rounded-md flex items-center gap-1 font-medium">
                    <Star size={10} /> default
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-x-3 mt-1 text-xs font-mono text-muted">
                <span><span className="text-subtle">act:</span> {a.accountId}</span>
                <span><span className="text-subtle">page:</span> {a.pageId}</span>
                {a.instagramActorId && (
                  <span className="col-span-2"><span className="text-subtle">ig:</span> {a.instagramActorId}</span>
                )}
              </div>
            </div>
            <button
              onClick={() => setEditing(a)}
              className="text-muted hover:text-fg p-2 rounded-lg hover:bg-raised shrink-0"
              title="Sửa"
            >
              <Edit3 size={14} />
            </button>
            <button
              onClick={() => handleDelete(a)}
              className="text-muted hover:text-danger p-2 rounded-lg hover:bg-danger-soft shrink-0"
              title="Xoá"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}

        {accounts.length === 0 && (
          <p className="text-sm text-muted text-center py-4">Chưa có account nào.</p>
        )}
      </div>

      <button
        onClick={() => setEditing(newMetaAccountDraft())}
        className="w-full text-sm bg-brand hover:bg-brand-dark text-white py-2.5 rounded-lg font-medium flex items-center justify-center gap-1.5"
      >
        <Plus size={14} /> Thêm Meta Account
      </button>

      {editing && (
        <MetaAccountForm
          account={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await refresh(); }}
        />
      )}
    </div>
  );
};

const MetaAccountForm: React.FC<{
  account: MetaAccount;
  onClose: () => void;
  onSaved: () => Promise<void>;
}> = ({ account, onClose, onSaved }) => {
  const [draft, setDraft] = useState<MetaAccount>(account);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const update = <K extends keyof MetaAccount>(k: K, v: MetaAccount[K]) =>
    setDraft(prev => ({ ...prev, [k]: v }));

  const save = async () => {
    const errs = validateMetaAccount(draft);
    setErrors(errs);
    if (errs.length > 0) return;
    setSaving(true);
    try {
      await saveMetaAccountToCloud(draft);
      await onSaved();
    } catch (e: any) {
      setErrors([e?.message || 'Lưu lỗi']);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-canvas border border-line rounded-2xl w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between px-5 py-3 border-b border-line bg-surface/60">
          <h3 className="text-sm font-semibold text-fg">
            {account.label ? 'Sửa Meta Account' : 'Thêm Meta Account'}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-raised text-muted hover:text-fg">
            <X size={14} />
          </button>
        </header>

        <div className="p-5 space-y-3">
          <div>
            <label className="text-[11px] font-medium text-muted block mb-1">Label *</label>
            <input
              type="text"
              value={draft.label}
              onChange={(e) => update('label', e.target.value)}
              placeholder="VD: Brand A — Page chính"
              className="w-full bg-canvas border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand"
            />
          </div>

          <div>
            <label className="text-[11px] font-medium text-muted block mb-1">Ad Account ID *</label>
            <input
              type="text"
              value={draft.accountId}
              onChange={(e) => update('accountId', e.target.value.trim())}
              placeholder="act_XXXXXXXXX"
              className="w-full bg-canvas border border-line rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:border-brand"
            />
            <p className="text-[10px] text-subtle mt-0.5">
              Trong Meta Business Manager → Ad Accounts. Format <code className="text-fg">act_</code> + số.
            </p>
          </div>

          <div>
            <label className="text-[11px] font-medium text-muted block mb-1">Facebook Page ID *</label>
            <input
              type="text"
              value={draft.pageId}
              onChange={(e) => update('pageId', e.target.value.trim())}
              placeholder="VD: 102345678901234"
              className="w-full bg-canvas border border-line rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:border-brand"
            />
            <p className="text-[10px] text-subtle mt-0.5">
              Page sẽ publish ad. Lấy từ Page → Settings → Page Info.
            </p>
          </div>

          <div>
            <label className="text-[11px] font-medium text-muted block mb-1">Instagram Actor ID</label>
            <input
              type="text"
              value={draft.instagramActorId || ''}
              onChange={(e) => update('instagramActorId', e.target.value.trim() || undefined)}
              placeholder="optional — IG account numeric ID"
              className="w-full bg-canvas border border-line rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:border-brand"
            />
            <p className="text-[10px] text-subtle mt-0.5">
              Không bắt buộc. Nếu để trống, ad chỉ chạy trên FB.
            </p>
          </div>

          <label className="text-xs text-fg flex items-center gap-2 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={!!draft.isDefault}
              onChange={(e) => update('isDefault', e.target.checked)}
            />
            Đặt làm mặc định
            <span className="text-xs text-muted">(wizard tự pick cái này)</span>
          </label>

          {errors.length > 0 && (
            <div className="status-danger border text-sm px-3 py-2 rounded-lg space-y-1">
              {errors.map((e, i) => <p key={i}>• {e}</p>)}
            </div>
          )}
        </div>

        <footer className="px-6 py-4 border-t border-line bg-surface flex justify-end gap-2">
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg bg-canvas hover:bg-raised text-fg border border-line">
            Huỷ
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="text-sm px-4 py-2 rounded-lg bg-brand hover:bg-brand-dark text-white font-medium disabled:opacity-50 flex items-center gap-1.5"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Lưu
          </button>
        </footer>
      </div>
    </div>
  );
};

// ────────────── Storage cleanup ──────────────

const StorageSection: React.FC = () => {
  const [report, setReport] = useState<StorageReport | null>(null);
  const [selected, setSelected] = useState<Set<StorageGroupId>>(new Set());
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    const r = await inventoryLocalStorage();
    setReport(r);
    // pre-select all safe groups
    setSelected(new Set(r.groups.filter(g => g.safe).map(g => g.id)));
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const toggle = (id: StorageGroupId) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleClear = async () => {
    if (!report || selected.size === 0) return;
    const unsafe = report.groups.filter(g => selected.has(g.id) && !g.safe);
    if (unsafe.length > 0) {
      const msg = `Bạn đang xoá nhóm KHÔNG an toàn:\n\n${unsafe.map(g => `• ${g.label}`).join('\n')}\n\nTiếp tục?`;
      if (!confirm(msg)) return;
    }
    setClearing(true);
    const reclaimed = clearGroups(Array.from(selected), report.items);
    setFlash(`Đã giải phóng ${formatBytes(reclaimed)}`);
    setTimeout(() => setFlash(null), 3000);
    await refresh();
    setClearing(false);
  };

  if (loading || !report) {
    return (
      <div className="py-12 text-center text-muted">
        <Loader2 className="animate-spin mx-auto" size={20} />
      </div>
    );
  }

  const usagePct = report.quotaBytes
    ? Math.min(100, (report.totalBytes / report.quotaBytes) * 100)
    : null;
  const usageBarColor =
    usagePct == null ? 'bg-brand' :
    usagePct > 80    ? 'bg-danger-fg' :
    usagePct > 50    ? 'bg-warning-fg' :
                       'bg-success-fg';

  return (
    <div className="space-y-4">
      {/* Usage bar */}
      <div className="bg-surface border border-line rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-sm font-semibold text-fg">Dung lượng localStorage</p>
            <p className="text-xs text-muted">Browser cap ~5-10 MB. Quá quota → setItem throws, app lỗi.</p>
          </div>
          <span className="text-base font-mono font-semibold text-fg">{formatBytes(report.totalBytes)}</span>
        </div>
        <div className="h-2 bg-raised rounded-full overflow-hidden">
          <div
            className={`h-full transition-all`}
            style={{
              width: `${Math.max(2, usagePct || 0)}%`,
              background: usagePct == null
                ? 'var(--brand)'
                : usagePct > 80 ? 'var(--danger-fg)'
                : usagePct > 50 ? 'var(--warning-fg)'
                : 'var(--success-fg)',
            }}
          />
        </div>
        {report.quotaBytes && (
          <p className="text-xs text-muted mt-1.5">
            ~{Math.round(usagePct || 0)}% của {formatBytes(report.quotaBytes)} (storage estimate — limit thực của localStorage thường nhỏ hơn)
          </p>
        )}
      </div>

      {flash && (
        <div className="status-success border text-sm px-3 py-2 rounded-lg flex items-center gap-2">
          <CheckCircle size={14} /> {flash}
        </div>
      )}

      {/* Group list */}
      <div className="space-y-2">
        {report.groups.map(g => {
          const checked = selected.has(g.id);
          return (
            <label
              key={g.id}
              className={`flex items-start gap-3 p-3 bg-surface border rounded-xl cursor-pointer hover:bg-raised transition-colors ${
                checked ? 'border-brand' : 'border-line'
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(g.id)}
                className="mt-0.5 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-fg">{g.label}</p>
                  {g.safe ? (
                    <span className="text-xs status-success border px-2 py-0.5 rounded-md font-medium">an toàn</span>
                  ) : (
                    <span className="text-xs status-warning border px-2 py-0.5 rounded-md font-medium">cẩn thận</span>
                  )}
                </div>
                <p className="text-xs text-muted mt-1 leading-relaxed">{g.description}</p>
                <p className="text-xs text-subtle font-mono mt-1">{g.count} item · {formatBytes(g.bytes)}</p>
              </div>
            </label>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-2">
        <p className="text-xs text-muted">
          {selected.size === 0
            ? 'Chưa chọn nhóm nào.'
            : `Đã chọn ${selected.size} nhóm.`}
        </p>
        <div className="flex gap-2">
          <button
            onClick={refresh}
            className="text-sm bg-canvas hover:bg-raised text-fg border border-line px-3 py-2 rounded-lg"
          >
            Scan lại
          </button>
          <button
            onClick={handleClear}
            disabled={clearing || selected.size === 0}
            className="text-sm bg-brand hover:bg-brand-dark disabled:opacity-50 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-1.5"
          >
            {clearing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Dọn dẹp
          </button>
        </div>
      </div>
    </div>
  );
};
