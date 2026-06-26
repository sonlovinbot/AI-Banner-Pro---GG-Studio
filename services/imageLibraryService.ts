import { LibraryImage, LibraryCategory } from '../types';
import { getSupabase } from './supabaseClient';
import { uploadToBunny, uploadDataUrlToBunny, BunnyFolder } from './bunnyService';

async function requireUserId(): Promise<string> {
  const { data: { user } } = await getSupabase().auth.getUser();
  if (!user) throw new Error('Chưa đăng nhập');
  return user.id;
}

function rowToImage(r: any): LibraryImage {
  return {
    id: r.id,
    url: r.url,
    fileName: r.file_name || '',
    mimeType: r.mime_type || 'image/jpeg',
    addedAt: r.added_at ? new Date(r.added_at).getTime() : Date.now(),
  };
}

const folderForCategory = (c: LibraryCategory | 'logo'): BunnyFolder =>
  ({ ref: 'refs', prod: 'products', face: 'face', logo: 'logo' } as const)[c];

export async function listLibraryFromCloud(category: LibraryCategory | 'logo'): Promise<LibraryImage[]> {
  try {
    const { data, error } = await getSupabase()
      .from('library_images')
      .select('*')
      .eq('category', category)
      .order('added_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(rowToImage);
  } catch (e) {
    console.warn('listLibraryFromCloud failed', e);
    return [];
  }
}

export async function addFileToLibrary(file: File, category: LibraryCategory | 'logo'): Promise<LibraryImage> {
  const userId = await requireUserId();
  const upload = await uploadToBunny(file, folderForCategory(category));
  const id = Math.random().toString(36).substring(7);
  const row = {
    id,
    user_id: userId,
    category,
    url: upload.url,
    file_name: file.name,
    mime_type: upload.mime,
    added_at: new Date().toISOString(),
  };
  const { error } = await getSupabase().from('library_images').insert(row);
  if (error) throw error;
  return rowToImage(row);
}

export async function addDataUrlToLibrary(
  dataUrl: string,
  fileName: string,
  category: LibraryCategory | 'logo',
): Promise<LibraryImage> {
  const userId = await requireUserId();
  const upload = await uploadDataUrlToBunny(dataUrl, fileName, folderForCategory(category));
  const id = Math.random().toString(36).substring(7);
  const row = {
    id,
    user_id: userId,
    category,
    url: upload.url,
    file_name: fileName,
    mime_type: upload.mime,
    added_at: new Date().toISOString(),
  };
  const { error } = await getSupabase().from('library_images').insert(row);
  if (error) throw error;
  return rowToImage(row);
}

export async function removeLibraryItemFromCloud(id: string): Promise<void> {
  const { error } = await getSupabase().from('library_images').delete().eq('id', id);
  if (error) throw error;
}
