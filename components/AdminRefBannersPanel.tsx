// Admin section for managing the curated reference banner library.
// Only rendered when isAdmin(user) is true (see ProfileSettingsModal).

import React, { useEffect, useState } from 'react';
import {
  Loader2, Upload, Trash2, Edit3, Sparkles, X, AlertCircle, CheckCircle, Image as ImageIcon,
} from 'lucide-react';
import {
  RefCategory, RefBanner, RefBannerInsights,
  listRefCategories, listRefBanners,
  createRefBanner, updateRefBanner, deleteRefBanner,
  extractInsightsFromUrl,
} from '../services/refBannersService';
import { uploadToBunny } from '../services/bunnyService';

export const AdminRefBannersPanel: React.FC = () => {
  const [categories, setCategories] = useState<RefCategory[]>([]);
  const [banners, setBanners] = useState<RefBanner[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<RefBanner | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [cats, bans] = await Promise.all([
        listRefCategories(),
        listRefBanners(activeCategory || undefined),
      ]);
      setCategories(cats);
      setBanners(bans);
    } catch (e: any) {
      setError(e?.message || 'Tải lỗi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, [activeCategory]);

  if (loading && categories.length === 0) {
    return <div className="py-8 text-center text-muted"><Loader2 className="animate-spin mx-auto" size={20} /></div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-fg">Reference banner library</p>
          <p className="text-[11px] text-subtle">
            Upload banner templates phân loại theo ngành. User sẽ pick ngành trong Banner Tool →
            hệ thống tự include refs này + insights khi gen.
          </p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="text-xs bg-brand hover:bg-brand-dark text-white px-3 py-1.5 rounded-md font-medium flex items-center gap-1.5"
        >
          <Upload size={12} /> Upload
        </button>
      </div>

      {/* Category filter */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          onClick={() => setActiveCategory('')}
          className={`text-[11px] px-2.5 py-1 rounded-md border ${
            activeCategory === '' ? 'bg-brand border-brand text-white' : 'bg-canvas border-line text-muted hover:bg-raised'
          }`}
        >
          Tất cả ({banners.length})
        </button>
        {categories.map(c => (
          <button
            key={c.id}
            onClick={() => setActiveCategory(c.id)}
            className={`text-[11px] px-2.5 py-1 rounded-md border ${
              activeCategory === c.id ? 'bg-brand border-brand text-white' : 'bg-canvas border-line text-muted hover:bg-raised'
            }`}
          >
            {c.emoji} {c.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="status-danger border text-xs px-3 py-2 rounded-lg flex items-center gap-2">
          <AlertCircle size={12} /> {error}
        </div>
      )}

      {banners.length === 0 ? (
        <div className="text-center text-muted py-12 border border-dashed border-line rounded-xl">
          <ImageIcon size={28} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">Chưa có ref banner nào{activeCategory ? ' trong ngành này' : ''}.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
          {banners.map(b => {
            const cat = categories.find(c => c.id === b.categoryId);
            return (
              <div key={b.id} className="bg-surface border border-line rounded-lg overflow-hidden flex flex-col">
                <div className="aspect-square bg-canvas relative">
                  <img src={b.imageUrl} alt={b.label || ''} className="w-full h-full object-cover" />
                  <span className="absolute top-1.5 left-1.5 text-[10px] bg-black/70 text-white px-1.5 py-0.5 rounded">
                    {cat?.emoji} {cat?.label}
                  </span>
                  {b.insights && (
                    <span className="absolute top-1.5 right-1.5 text-[10px] bg-success-fg text-white px-1.5 py-0.5 rounded flex items-center gap-1" title="Có insights AI">
                      <Sparkles size={9} /> AI
                    </span>
                  )}
                </div>
                <div className="p-2 flex-1 flex flex-col gap-1">
                  <p className="text-xs font-medium text-fg truncate" title={b.label}>
                    {b.label || '(no label)'}
                  </p>
                  {b.insights?.layout && (
                    <p className="text-[10px] text-muted line-clamp-2" title={b.insights.layout}>
                      {b.insights.layout}
                    </p>
                  )}
                  <div className="flex items-center gap-1 mt-auto pt-1">
                    <button
                      onClick={() => setEditing(b)}
                      className="text-[11px] text-muted hover:text-fg p-1 rounded hover:bg-raised flex items-center gap-1"
                    >
                      <Edit3 size={10} /> Sửa
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm(`Xoá ref "${b.label || b.id}"?`)) return;
                        await deleteRefBanner(b.id);
                        await refresh();
                      }}
                      className="text-[11px] text-muted hover:text-danger p-1 rounded hover:bg-danger-soft flex items-center gap-1 ml-auto"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showUpload && (
        <UploadModal
          categories={categories}
          defaultCategory={activeCategory || categories[0]?.id || 'other'}
          onClose={() => setShowUpload(false)}
          onSaved={async () => { setShowUpload(false); await refresh(); }}
        />
      )}

      {editing && (
        <EditModal
          banner={editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await refresh(); }}
        />
      )}
    </div>
  );
};

// ─────────────────── Upload modal ───────────────────

const UploadModal: React.FC<{
  categories: RefCategory[];
  defaultCategory: string;
  onClose: () => void;
  onSaved: () => void;
}> = ({ categories, defaultCategory, onClose, onSaved }) => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState(defaultCategory);
  const [label, setLabel] = useState('');
  const [insights, setInsights] = useState<RefBannerInsights>({});
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onFile = (f: File) => {
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setUploadedUrl(null);
  };

  const handleUploadOnly = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const result = await uploadToBunny(file, 'refs');
      setUploadedUrl(result.url);
    } catch (e: any) {
      setError(e?.message || 'Upload lỗi');
    } finally {
      setUploading(false);
    }
  };

  const handleExtract = async () => {
    if (!uploadedUrl) {
      setError('Upload ảnh trước rồi mới extract được');
      return;
    }
    setExtracting(true);
    setError(null);
    try {
      const ai = await extractInsightsFromUrl(uploadedUrl);
      setInsights(ai);
    } catch (e: any) {
      setError(e?.message || 'AI extract lỗi');
    } finally {
      setExtracting(false);
    }
  };

  const handleSave = async () => {
    if (!uploadedUrl) {
      setError('Upload ảnh trước');
      return;
    }
    if (!categoryId) {
      setError('Chọn category');
      return;
    }
    try {
      await createRefBanner({
        categoryId,
        imageUrl: uploadedUrl,
        label: label || undefined,
        insights: Object.keys(insights).length > 0 ? insights : undefined,
        notes: notes || undefined,
      });
      onSaved();
    } catch (e: any) {
      setError(e?.message || 'Save lỗi');
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-canvas border border-line rounded-2xl w-full max-w-lg shadow-2xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <header className="px-5 py-3 border-b border-line bg-surface flex items-center justify-between">
          <h3 className="text-sm font-semibold text-fg">Upload ref banner</h3>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-raised text-muted hover:text-fg">
            <X size={14} />
          </button>
        </header>
        <div className="p-5 space-y-3">
          {/* File */}
          <div>
            <label className="text-[11px] font-medium text-muted block mb-1">Banner image *</label>
            {preview ? (
              <div className="space-y-1.5">
                <img src={preview} className="w-full max-h-40 object-contain rounded border border-line bg-raised" />
                {!uploadedUrl && (
                  <button
                    onClick={handleUploadOnly}
                    disabled={uploading}
                    className="text-xs bg-brand hover:bg-brand-dark text-white px-2.5 py-1.5 rounded flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {uploading ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
                    Upload to CDN
                  </button>
                )}
                {uploadedUrl && (
                  <p className="text-[11px] text-success flex items-center gap-1">
                    <CheckCircle size={11} /> Uploaded — ready to save
                  </p>
                )}
              </div>
            ) : (
              <input
                type="file"
                accept="image/*"
                onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
                className="w-full text-xs"
              />
            )}
          </div>

          {/* Category */}
          <div>
            <label className="text-[11px] font-medium text-muted block mb-1">Category *</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full bg-canvas border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand"
            >
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>
              ))}
            </select>
          </div>

          {/* Label */}
          <div>
            <label className="text-[11px] font-medium text-muted block mb-1">Label (optional)</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="VD: Coffee shop launch poster"
              className="w-full bg-canvas border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand"
            />
          </div>

          {/* AI insights */}
          {uploadedUrl && (
            <div className="border border-line rounded-lg p-3 space-y-2 bg-raised/30">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-fg flex items-center gap-1.5">
                  <Sparkles size={12} className="text-brand" /> Insights AI
                </p>
                <button
                  onClick={handleExtract}
                  disabled={extracting}
                  className="text-[11px] bg-brand hover:bg-brand-dark text-white px-2 py-1 rounded flex items-center gap-1 disabled:opacity-50"
                >
                  {extracting ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
                  {Object.keys(insights).length > 0 ? 'Re-extract' : 'Extract'}
                </button>
              </div>
              {Object.keys(insights).length > 0 && (
                <div className="space-y-1.5 text-[11px]">
                  <InsightRow label="Layout" value={insights.layout} onChange={(v) => setInsights(p => ({ ...p, layout: v }))} />
                  <InsightRow label="Title position" value={insights.title_position} onChange={(v) => setInsights(p => ({ ...p, title_position: v }))} />
                  <InsightRow label="Composition" value={insights.composition} onChange={(v) => setInsights(p => ({ ...p, composition: v }))} />
                  <InsightRow label="Color palette" value={insights.color_palette?.join(', ')} onChange={(v) => setInsights(p => ({ ...p, color_palette: v.split(',').map(s => s.trim()).filter(Boolean) }))} />
                  <InsightRow label="Style notes" value={insights.style_notes} onChange={(v) => setInsights(p => ({ ...p, style_notes: v }))} />
                </div>
              )}
              <p className="text-[10px] text-subtle">
                AI chỉ phân tích layout/composition — KHÔNG đọc content text trong ảnh.
              </p>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="text-[11px] font-medium text-muted block mb-1">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Ghi chú thêm cho team..."
              className="w-full bg-canvas border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand resize-none"
            />
          </div>

          {error && (
            <div className="status-danger border text-xs px-3 py-2 rounded-lg flex items-center gap-2">
              <AlertCircle size={12} /> {error}
            </div>
          )}
        </div>
        <footer className="px-5 py-3 border-t border-line bg-surface flex justify-end gap-2">
          <button onClick={onClose} className="text-sm px-3 py-1.5 rounded-lg bg-canvas border border-line hover:bg-raised text-fg">
            Huỷ
          </button>
          <button
            onClick={handleSave}
            disabled={!uploadedUrl || !categoryId}
            className="text-sm px-4 py-1.5 rounded-lg bg-brand hover:bg-brand-dark text-white font-semibold disabled:opacity-50"
          >
            Save ref banner
          </button>
        </footer>
      </div>
    </div>
  );
};

const InsightRow: React.FC<{
  label: string;
  value?: string;
  onChange: (v: string) => void;
}> = ({ label, value, onChange }) => (
  <div className="flex items-start gap-2">
    <span className="text-muted shrink-0 w-20 pt-1">{label}:</span>
    <input
      type="text"
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      className="flex-1 bg-canvas border border-line rounded px-2 py-0.5 text-[11px] focus:outline-none focus:border-brand"
    />
  </div>
);

// ─────────────────── Edit modal ───────────────────

const EditModal: React.FC<{
  banner: RefBanner;
  categories: RefCategory[];
  onClose: () => void;
  onSaved: () => void;
}> = ({ banner, categories, onClose, onSaved }) => {
  const [label, setLabel] = useState(banner.label || '');
  const [categoryId, setCategoryId] = useState(banner.categoryId);
  const [insights, setInsights] = useState<RefBannerInsights>(banner.insights || {});
  const [notes, setNotes] = useState(banner.notes || '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateRefBanner(banner.id, { label, categoryId, insights, notes });
      onSaved();
    } catch (e: any) {
      setError(e?.message || 'Save lỗi');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-canvas border border-line rounded-2xl w-full max-w-lg shadow-2xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <header className="px-5 py-3 border-b border-line bg-surface flex items-center justify-between">
          <h3 className="text-sm font-semibold text-fg">Sửa ref banner</h3>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-raised text-muted hover:text-fg">
            <X size={14} />
          </button>
        </header>
        <div className="p-5 space-y-3">
          <img src={banner.imageUrl} className="w-full max-h-40 object-contain rounded border border-line bg-raised" />

          <div>
            <label className="text-[11px] font-medium text-muted block mb-1">Category</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full bg-canvas border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand"
            >
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-medium text-muted block mb-1">Label</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full bg-canvas border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand"
            />
          </div>

          <div className="border border-line rounded-lg p-3 space-y-2 bg-raised/30">
            <p className="text-xs font-medium text-fg">Insights</p>
            <InsightRow label="Layout" value={insights.layout} onChange={(v) => setInsights(p => ({ ...p, layout: v }))} />
            <InsightRow label="Title position" value={insights.title_position} onChange={(v) => setInsights(p => ({ ...p, title_position: v }))} />
            <InsightRow label="Composition" value={insights.composition} onChange={(v) => setInsights(p => ({ ...p, composition: v }))} />
            <InsightRow label="Color palette" value={insights.color_palette?.join(', ')} onChange={(v) => setInsights(p => ({ ...p, color_palette: v.split(',').map(s => s.trim()).filter(Boolean) }))} />
            <InsightRow label="Style notes" value={insights.style_notes} onChange={(v) => setInsights(p => ({ ...p, style_notes: v }))} />
          </div>

          <div>
            <label className="text-[11px] font-medium text-muted block mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full bg-canvas border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand resize-none"
            />
          </div>

          {error && (
            <div className="status-danger border text-xs px-3 py-2 rounded-lg flex items-center gap-2">
              <AlertCircle size={12} /> {error}
            </div>
          )}
        </div>
        <footer className="px-5 py-3 border-t border-line bg-surface flex justify-end gap-2">
          <button onClick={onClose} className="text-sm px-3 py-1.5 rounded-lg bg-canvas border border-line hover:bg-raised text-fg">
            Huỷ
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-sm px-4 py-1.5 rounded-lg bg-brand hover:bg-brand-dark text-white font-semibold disabled:opacity-50 flex items-center gap-1.5"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : null}
            Save
          </button>
        </footer>
      </div>
    </div>
  );
};
