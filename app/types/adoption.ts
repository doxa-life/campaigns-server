export interface Adoption {
  id: number
  people_group_id: number
  group_id: number
  status: 'pending' | 'active' | 'inactive'
  update_token: string
  show_publicly: boolean
  adopted_at: string | null
  people_group_name: string
  people_group_slug: string | null
  group_name: string
  report_count: number
  created_at: string
}

export interface AdoptionReport {
  id: number
  adoption_id: number
  praying_count: number | null
  stories: string | null
  comments: string | null
  status: 'submitted' | 'approved' | 'rejected'
  submitted_at: string
}
