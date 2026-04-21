# FRONTEND — Next.js 14 + Tailwind + shadcn/ui

## Setup inicial

```bash
npx create-next-app@latest frontend --typescript --tailwind --app --eslint
cd frontend
npx shadcn-ui@latest init
npx shadcn-ui@latest add button card input textarea dialog badge toast separator scroll-area
npm install lucide-react
```

---

## lib/types.ts

```typescript
export interface Assistant {
  id: string
  name: string
  description?: string
  instructions: string
  created_at: string
  updated_at: string
}

export interface Document {
  id: string
  assistant_id: string
  filename: string
  file_type: string
  size_bytes?: number
  chunk_count: number
  status: 'processing' | 'ready' | 'error'
  created_at: string
}

export interface Source {
  chunk_id: string
  document_id: string
  filename: string
  content: string
  similarity: number
}

export interface Message {
  id: string
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  sources: Source[]
  created_at: string
}

export interface Conversation {
  id: string
  assistant_id: string
  title?: string
  created_at: string
  updated_at: string
}

export interface ChatResponse {
  conversation_id: string
  message_id: string
  answer: string
  sources: Source[]
  found_context: boolean
}
```

---

## lib/api.ts

```typescript
const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(err || `Error ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

// Assistants
export const api = {
  assistants: {
    list: () => req<Assistant[]>('/assistants/'),
    get: (id: string) => req<Assistant>(`/assistants/${id}`),
    create: (data: { name: string; instructions: string; description?: string }) =>
      req<Assistant>('/assistants/', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Assistant>) =>
      req<Assistant>(`/assistants/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) =>
      req<void>(`/assistants/${id}`, { method: 'DELETE' }),
  },

  documents: {
    list: (assistantId: string) =>
      req<Document[]>(`/assistants/${assistantId}/documents`),
    upload: (assistantId: string, file: File) => {
      const form = new FormData()
      form.append('file', file)
      return fetch(`${BASE}/api/assistants/${assistantId}/documents`, {
        method: 'POST',
        body: form,
      }).then(r => r.json())
    },
    delete: (assistantId: string, documentId: string) =>
      req<void>(`/assistants/${assistantId}/documents/${documentId}`, { method: 'DELETE' }),
  },

  chat: {
    send: (assistantId: string, message: string, conversationId?: string) =>
      req<ChatResponse>(`/assistants/${assistantId}/chat`, {
        method: 'POST',
        body: JSON.stringify({ message, conversation_id: conversationId }),
      }),
    conversations: (assistantId: string) =>
      req<Conversation[]>(`/assistants/${assistantId}/conversations`),
    messages: (assistantId: string, conversationId: string) =>
      req<Message[]>(`/assistants/${assistantId}/conversations/${conversationId}/messages`),
    deleteConversation: (assistantId: string, conversationId: string) =>
      req<void>(`/assistants/${assistantId}/conversations/${conversationId}`, { method: 'DELETE' }),
  },
}
```

---

## Páginas (App Router)

### app/assistants/page.tsx — Lista de asistentes

```tsx
'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Assistant } from '@/lib/types'
import AssistantCard from '@/components/AssistantCard'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Plus } from 'lucide-react'

export default function AssistantsPage() {
  const [assistants, setAssistants] = useState<Assistant[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.assistants.list().then(setAssistants).finally(() => setLoading(false))
  }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este asistente y todos sus documentos?')) return
    await api.assistants.delete(id)
    setAssistants(prev => prev.filter(a => a.id !== id))
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Mis Asistentes</h1>
          <p className="text-muted-foreground mt-1">Gestiona tus asistentes IA personalizados</p>
        </div>
        <Link href="/assistants/new">
          <Button><Plus className="mr-2 h-4 w-4" /> Nuevo Asistente</Button>
        </Link>
      </div>

      {loading ? (
        <p>Cargando...</p>
      ) : assistants.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <p className="text-lg">No tienes asistentes aún.</p>
          <Link href="/assistants/new">
            <Button className="mt-4">Crear mi primer asistente</Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {assistants.map(a => (
            <AssistantCard key={a.id} assistant={a} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  )
}
```

### app/assistants/[id]/chat/page.tsx — Chat

```tsx
'use client'
import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import { api } from '@/lib/api'
import { Message, Conversation } from '@/lib/types'
import ChatMessage from '@/components/ChatMessage'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Send, Plus, Trash2 } from 'lucide-react'

export default function ChatPage() {
  const { id: assistantId } = useParams() as { id: string }
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConvId, setActiveConvId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.chat.conversations(assistantId).then(setConversations)
  }, [assistantId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadConversation = async (convId: string) => {
    setActiveConvId(convId)
    const msgs = await api.chat.messages(assistantId, convId)
    setMessages(msgs)
  }

  const newConversation = () => {
    setActiveConvId(null)
    setMessages([])
  }

  const deleteConversation = async (convId: string) => {
    await api.chat.deleteConversation(assistantId, convId)
    setConversations(prev => prev.filter(c => c.id !== convId))
    if (activeConvId === convId) newConversation()
  }

  const sendMessage = async () => {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput('')
    setLoading(true)

    // Añadir mensaje del usuario optimistamente
    const tempUserMsg: Message = {
      id: 'temp-user',
      conversation_id: activeConvId || '',
      role: 'user',
      content: userMsg,
      sources: [],
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, tempUserMsg])

    try {
      const res = await api.chat.send(assistantId, userMsg, activeConvId || undefined)

      if (!activeConvId) {
        setActiveConvId(res.conversation_id)
        const newConvs = await api.chat.conversations(assistantId)
        setConversations(newConvs)
      }

      const assistantMsg: Message = {
        id: res.message_id,
        conversation_id: res.conversation_id,
        role: 'assistant',
        content: res.answer,
        sources: res.sources,
        created_at: new Date().toISOString(),
      }
      setMessages(prev => [...prev.filter(m => m.id !== 'temp-user'), tempUserMsg, assistantMsg])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-screen">
      {/* Sidebar de conversaciones */}
      <aside className="w-64 border-r flex flex-col">
        <div className="p-4 border-b">
          <Button className="w-full" variant="outline" onClick={newConversation}>
            <Plus className="mr-2 h-4 w-4" /> Nueva conversación
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.map(conv => (
            <div
              key={conv.id}
              className={`flex items-center justify-between p-2 rounded cursor-pointer hover:bg-accent ${activeConvId === conv.id ? 'bg-accent' : ''}`}
            >
              <span className="text-sm truncate flex-1" onClick={() => loadConversation(conv.id)}>
                {conv.title || 'Conversación sin título'}
              </span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteConversation(conv.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      </aside>

      {/* Chat area */}
      <main className="flex-1 flex flex-col">
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-muted-foreground mt-20">
              <p className="text-lg">Empieza a chatear con este asistente</p>
            </div>
          )}
          {messages.map(msg => (
            <ChatMessage key={msg.id} message={msg} />
          ))}
          {loading && (
            <div className="flex gap-2 items-center text-muted-foreground">
              <div className="animate-pulse">Generando respuesta...</div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t p-4 flex gap-2">
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            placeholder="Escribe tu mensaje..."
            disabled={loading}
            className="flex-1"
          />
          <Button onClick={sendMessage} disabled={loading || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </main>
    </div>
  )
}
```

---

## components/ChatMessage.tsx

```tsx
import { Message, Source } from '@/lib/types'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, ChevronUp, FileText } from 'lucide-react'

export default function ChatMessage({ message }: { message: Message }) {
  const [showSources, setShowSources] = useState(false)
  const isUser = message.role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[75%] space-y-2`}>
        <div
          className={`rounded-2xl px-4 py-3 ${
            isUser
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted'
          }`}
        >
          <p className="whitespace-pre-wrap text-sm">{message.content}</p>
        </div>

        {/* Fuentes / citas */}
        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="ml-2">
            <button
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setShowSources(!showSources)}
            >
              <FileText className="h-3 w-3" />
              {message.sources.length} fuente(s) usada(s)
              {showSources ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>

            {showSources && (
              <div className="mt-2 space-y-2">
                {message.sources.map((src, i) => (
                  <SourceCard key={src.chunk_id} source={src} index={i + 1} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function SourceCard({ source, index }: { source: Source; index: number }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="border rounded-lg p-3 text-xs bg-card">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px]">Fuente {index}</Badge>
          <span className="font-medium text-muted-foreground">{source.filename}</span>
        </div>
        <span className="text-muted-foreground">{Math.round(source.similarity * 100)}% relevancia</span>
      </div>
      <p className={`text-muted-foreground ${expanded ? '' : 'line-clamp-2'}`}>
        {source.content}
      </p>
      <button
        className="text-primary mt-1 hover:underline"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? 'Ver menos' : 'Ver más'}
      </button>
    </div>
  )
}
```

---

## components/AssistantCard.tsx

```tsx
import { Assistant } from '@/lib/types'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { MessageSquare, FileText, Pencil, Trash2 } from 'lucide-react'

interface Props {
  assistant: Assistant
  onDelete: (id: string) => void
}

export default function AssistantCard({ assistant, onDelete }: Props) {
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle className="text-lg">{assistant.name}</CardTitle>
        {assistant.description && (
          <p className="text-sm text-muted-foreground">{assistant.description}</p>
        )}
      </CardHeader>
      <CardContent className="flex-1">
        <p className="text-xs text-muted-foreground line-clamp-3 italic">
          "{assistant.instructions}"
        </p>
      </CardContent>
      <CardFooter className="flex gap-2 flex-wrap">
        <Link href={`/assistants/${assistant.id}/chat`} className="flex-1">
          <Button className="w-full" size="sm">
            <MessageSquare className="mr-1 h-3 w-3" /> Chat
          </Button>
        </Link>
        <Link href={`/assistants/${assistant.id}/documents`}>
          <Button variant="outline" size="sm">
            <FileText className="h-3 w-3" />
          </Button>
        </Link>
        <Link href={`/assistants/${assistant.id}/edit`}>
          <Button variant="outline" size="sm">
            <Pencil className="h-3 w-3" />
          </Button>
        </Link>
        <Button variant="destructive" size="sm" onClick={() => onDelete(assistant.id)}>
          <Trash2 className="h-3 w-3" />
        </Button>
      </CardFooter>
    </Card>
  )
}
```

---

## components/AssistantForm.tsx

```tsx
'use client'
import { useState } from 'react'
import { Assistant } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

interface Props {
  initial?: Partial<Assistant>
  onSubmit: (data: { name: string; instructions: string; description?: string }) => Promise<void>
  submitLabel?: string
}

export default function AssistantForm({ initial, onSubmit, submitLabel = 'Guardar' }: Props) {
  const [name, setName] = useState(initial?.name || '')
  const [instructions, setInstructions] = useState(initial?.instructions || '')
  const [description, setDescription] = useState(initial?.description || '')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await onSubmit({ name, instructions, description: description || undefined })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      <div className="space-y-2">
        <Label htmlFor="name">Nombre *</Label>
        <Input
          id="name"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Ej: Asistente de RRHH"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Descripción (opcional)</Label>
        <Input
          id="description"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Breve descripción del asistente"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="instructions">Instrucciones del sistema *</Label>
        <p className="text-xs text-muted-foreground">
          Define cómo debe comportarse el asistente, su tono, su rol, etc.
        </p>
        <Textarea
          id="instructions"
          value={instructions}
          onChange={e => setInstructions(e.target.value)}
          placeholder="Eres un asistente experto en recursos humanos. Responde siempre de forma profesional y empática. Solo usa la información de los documentos proporcionados."
          rows={6}
          required
        />
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? 'Guardando...' : submitLabel}
      </Button>
    </form>
  )
}
```

---

## Rutas de navegación

```
/                          → redirect a /assistants
/assistants                → lista de asistentes
/assistants/new            → crear asistente
/assistants/[id]           → detalle del asistente
/assistants/[id]/edit      → editar asistente
/assistants/[id]/documents → documentos del asistente
/assistants/[id]/chat      → chat con el asistente
```

---

## Estructura del layout principal

El `app/layout.tsx` debe incluir una barra de navegación lateral o superior con:
- Logo / nombre de la app
- Link a `/assistants`
- Breadcrumbs contextuales en cada página

Usa `shadcn/ui` componentes para mantener consistencia visual.
