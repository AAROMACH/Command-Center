'use client';

import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, updateDoc } from 'firebase/firestore';
import { storage, db } from '@/lib/firebase';

const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export async function uploadAvatar(userId: string, file: File): Promise<string> {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        throw new Error('Invalid file type. Please upload a JPG, PNG, GIF, or WebP image.');
    }
    if (file.size > MAX_AVATAR_SIZE) {
        throw new Error('File size exceeds the 5 MB limit.');
    }

    const storageRef = ref(storage, `avatars/${userId}`);
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);
    await updateDoc(doc(db, 'users', userId), { avatarUrl: url });
    return url;
}

export async function uploadFile(
    path: string,
    file: File,
    metadata?: { contentType?: string }
): Promise<{ url: string; storagePath: string; name: string; size: string }> {
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file, metadata);
    const url = await getDownloadURL(storageRef);
    return {
        url,
        storagePath: path,
        name: file.name,
        size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
    };
}
