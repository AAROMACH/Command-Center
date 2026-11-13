import 'server-only';
import { GoogleGenAI } from '@google/genai';

/** Shared Gemini setup for server routes (help assistant, site-walk gap check). */
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
export const geminiKey = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
export const gemini = () => new GoogleGenAI({ apiKey: geminiKey() });
