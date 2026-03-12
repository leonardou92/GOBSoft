import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { marked } from 'marked';
import { logError } from '../utils/logger';

const router = Router();

router.get('/context', async (_req, res) => {
  try {
    const mdPath = path.resolve(process.cwd(), 'docs', 'PROJECT_CONTEXT.md');

    const markdown = await fs.promises.readFile(mdPath, 'utf8');
    const html = marked(markdown);

    return res.json({
      file: 'docs/PROJECT_CONTEXT.md',
      markdown,
      html,
    });
  } catch (error) {
    logError('docs/context', error);
    return res.status(500).json({
      message: 'No se pudo leer el contexto del proyecto.',
    });
  }
});

export default router;

