import type { JobType } from '@/types'

export interface NavItem {
  readonly label: string
  readonly i18nKey: string
  readonly path: string
  readonly icon: string
}

export interface ToolItem {
  readonly id: JobType | string
  readonly i18nKey: string
  readonly icon: string
  readonly path: string
  readonly color: string
}

export interface ToolCategory {
  readonly i18nKey: string
  readonly tools: readonly ToolItem[]
}

export interface MockDocument {
  readonly id: string
  readonly title: string
  readonly type: 'pdf' | 'jpg' | 'scan'
  readonly date: string
  readonly size: string
}

export interface MockFolder {
  readonly id: string
  readonly title: string
  readonly itemCount: number
}

export const navigationItems: readonly NavItem[] = [
  { label: 'Dashboard', i18nKey: 'nav.dashboard', path: '/dashboard', icon: 'LayoutDashboard' },
  { label: 'Documents', i18nKey: 'nav.documents', path: '/documents', icon: 'FileText' },
  { label: 'Scanner', i18nKey: 'nav.scanner', path: '/scanner', icon: 'Camera' },
  { label: 'Tools', i18nKey: 'nav.tools', path: '/tools', icon: 'Wrench' },
  { label: 'Projects', i18nKey: 'nav.projects', path: '/projects', icon: 'FolderOpen' },
  { label: 'Trash', i18nKey: 'nav.trash', path: '/trash', icon: 'Trash2' },
]

export const toolCategories: readonly ToolCategory[] = [
  {
    i18nKey: 'tools.organize',
    tools: [
      { id: 'merge', i18nKey: 'tools.merge', icon: 'Merge', path: '/tools/merge', color: '#ef4444' },
      { id: 'split', i18nKey: 'tools.split', icon: 'Split', path: '/tools/split', color: '#f97316' },
      { id: 'organize', i18nKey: 'tools.organizePages', icon: 'ArrowUpDown', path: '/tools/organize', color: '#eab308' },
      { id: 'rotate', i18nKey: 'tools.rotate', icon: 'RotateCw', path: '/tools/rotate', color: '#22c55e' },
      { id: 'delete-pages', i18nKey: 'tools.deletePages', icon: 'FileX', path: '/tools/delete-pages', color: '#dc2626' },
      { id: 'extract-pages', i18nKey: 'tools.extractPages', icon: 'FileOutput', path: '/tools/extract-pages', color: '#0ea5e9' },
    ],
  },
  {
    i18nKey: 'tools.optimize',
    tools: [
      { id: 'compress', i18nKey: 'tools.compress', icon: 'Minimize2', path: '/tools/compress', color: '#8b5cf6' },
      { id: 'ocr', i18nKey: 'tools.ocr', icon: 'ScanText', path: '/tools/ocr', color: '#06b6d4' },
      { id: 'repair', i18nKey: 'tools.repair', icon: 'Wrench', path: '/tools/repair', color: '#64748b' },
    ],
  },
  {
    i18nKey: 'tools.convertToPdf',
    tools: [
      { id: 'jpg-to-pdf', i18nKey: 'tools.jpgToPdf', icon: 'Image', path: '/tools/jpg-to-pdf', color: '#f59e0b' },
      { id: 'word-to-pdf', i18nKey: 'tools.wordToPdf', icon: 'FileText', path: '/tools/word-to-pdf', color: '#2563eb' },
      { id: 'excel-to-pdf', i18nKey: 'tools.excelToPdf', icon: 'Sheet', path: '/tools/excel-to-pdf', color: '#16a34a' },
      { id: 'ppt-to-pdf', i18nKey: 'tools.pptToPdf', icon: 'Presentation', path: '/tools/ppt-to-pdf', color: '#ea580c' },
    ],
  },
  {
    i18nKey: 'tools.convertFromPdf',
    tools: [
      { id: 'pdf-to-jpg', i18nKey: 'tools.pdfToJpg', icon: 'Image', path: '/tools/pdf-to-jpg', color: '#f59e0b' },
      { id: 'pdf-to-word', i18nKey: 'tools.pdfToWord', icon: 'FileText', path: '/tools/pdf-to-word', color: '#2563eb' },
      { id: 'pdf-to-excel', i18nKey: 'tools.pdfToExcel', icon: 'Sheet', path: '/tools/pdf-to-excel', color: '#16a34a' },
      { id: 'pdf-to-ppt', i18nKey: 'tools.pdfToPpt', icon: 'Presentation', path: '/tools/pdf-to-ppt', color: '#ea580c' },
    ],
  },
  {
    i18nKey: 'tools.edit',
    tools: [
      { id: 'edit', i18nKey: 'tools.editPdf', icon: 'PenTool', path: '/tools/edit', color: '#7c3aed' },
      { id: 'signature', i18nKey: 'tools.sign', icon: 'PenLine', path: '/tools/sign', color: '#1c7b1d' },
      { id: 'watermark', i18nKey: 'tools.watermark', icon: 'Droplets', path: '/tools/watermark', color: '#0891b2' },
      { id: 'page_numbers', i18nKey: 'tools.pageNumbers', icon: 'Hash', path: '/tools/page-numbers', color: '#4f46e5' },
      { id: 'crop', i18nKey: 'tools.crop', icon: 'Crop', path: '/tools/crop', color: '#b45309' },
    ],
  },
  {
    i18nKey: 'tools.security',
    tools: [
      { id: 'protect', i18nKey: 'tools.protect', icon: 'Lock', path: '/tools/protect', color: '#dc2626' },
      { id: 'unlock', i18nKey: 'tools.unlock', icon: 'Unlock', path: '/tools/unlock', color: '#16a34a' },
      { id: 'redact', i18nKey: 'tools.redact', icon: 'EyeOff', path: '/tools/redact', color: '#1e293b' },
    ],
  },
]

export const mockDocuments: readonly MockDocument[] = [
  { id: '1', title: 'Contrat de location 2024.pdf', type: 'pdf', date: '15 fév. 2026', size: '2.4 MB' },
  { id: '2', title: 'Facture Hydro-Québec.pdf', type: 'pdf', date: '12 fév. 2026', size: '1.8 MB' },
  { id: '3', title: 'Reçu pharmacie.jpg', type: 'jpg', date: '10 fév. 2026', size: '856 KB' },
  { id: '4', title: 'Scan passeport.pdf', type: 'scan', date: '8 fév. 2026', size: '3.1 MB' },
  { id: '5', title: 'Notes de cours.pdf', type: 'pdf', date: '5 fév. 2026', size: '945 KB' },
  { id: '6', title: 'Photo permis conduire.jpg', type: 'jpg', date: '3 fév. 2026', size: '1.2 MB' },
  { id: '7', title: 'Déclaration impôts 2025.pdf', type: 'pdf', date: '1 fév. 2026', size: '4.5 MB' },
  { id: '8', title: 'Relevé bancaire janvier.pdf', type: 'pdf', date: '28 jan. 2026', size: '890 KB' },
]

export const mockFolders: readonly MockFolder[] = [
  { id: 'f1', title: 'Documents personnels', itemCount: 12 },
  { id: 'f2', title: 'Factures', itemCount: 45 },
  { id: 'f3', title: 'Travail', itemCount: 8 },
  { id: 'f4', title: 'Médical', itemCount: 6 },
]
