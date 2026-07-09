import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { localStore } from './localStore'
import { uid } from '../lib/utils'
import { WORKSPACE_ROLES } from '../lib/constants'

// ---------------------------------------------------------------------------
// Servico de workspaces (tenants). Cada usuario participa de 1..N workspaces
// via workspace_members. O workspace "Pessoal" e criado no cadastro (trigger no
// banco / seed no modo demo).
// ---------------------------------------------------------------------------

export const workspaceService = {
  // Lista os workspaces em que o usuario e membro, com o papel dele.
  async listForUser(userId) {
    if (!isSupabaseConfigured) {
      const members = localStore
        .table('workspace_members')
        .filter((m) => m.user_id === userId)
      const workspaces = localStore.table('workspaces')
      return members
        .map((m) => {
          const ws = workspaces.find((w) => w.id === m.workspace_id)
          return ws ? { ...ws, role: m.role } : null
        })
        .filter(Boolean)
    }

    const { data, error } = await supabase
      .from('workspace_members')
      .select('role, workspaces(*)')
      .eq('user_id', userId)
    if (error) throw error
    return (data || [])
      .filter((row) => row.workspaces)
      .map((row) => ({ ...row.workspaces, role: row.role }))
      .sort((a, b) => {
        // Pessoal primeiro, depois por nome
        if (a.is_personal !== b.is_personal) return a.is_personal ? -1 : 1
        return a.name.localeCompare(b.name)
      })
  },

  // Cria um novo workspace e adiciona o criador como owner.
  // (Preparado para o futuro: criar "Carmais", "Familia", etc.)
  async create(userId, { name, slug }) {
    const base = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, "") // remove acentos
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    const finalSlug = slug || `${base || 'workspace'}-${uid().slice(0, 6)}`

    if (!isSupabaseConfigured) {
      const ws = {
        id: uid(),
        name,
        slug: finalSlug,
        owner_id: userId,
        is_personal: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      localStore.setTable('workspaces', [...localStore.table('workspaces'), ws])
      localStore.setTable('workspace_members', [
        ...localStore.table('workspace_members'),
        {
          id: uid(),
          workspace_id: ws.id,
          user_id: userId,
          role: WORKSPACE_ROLES.OWNER,
          invited_by: userId,
          created_at: new Date().toISOString(),
        },
      ])
      return { ...ws, role: WORKSPACE_ROLES.OWNER }
    }

    const { data: ws, error } = await supabase
      .from('workspaces')
      .insert({ name, slug: finalSlug, owner_id: userId, is_personal: false })
      .select()
      .single()
    if (error) throw error
    const { error: memberError } = await supabase.from('workspace_members').insert({
      workspace_id: ws.id,
      user_id: userId,
      role: WORKSPACE_ROLES.OWNER,
      invited_by: userId,
    })
    if (memberError) throw memberError
    return { ...ws, role: WORKSPACE_ROLES.OWNER }
  },
}
