import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { UserProfileDialog, ChangePasswordDialog } from '../DashboardDialogs'

const apiMocks = vi.hoisted(() => ({
  fetchUserProfile: vi.fn(),
  updateUserProfile: vi.fn(),
  changePassword: vi.fn(),
}))

const userProfileMocks = vi.hoisted(() => ({
  notifyUserProfileChanged: vi.fn(),
}))

vi.mock('../../../lib/api', () => apiMocks)
vi.mock('../../../lib/userProfile', () => userProfileMocks)

const logoutSpy = vi.fn()
vi.mock('../../AuthContext', () => ({
  useAuth: () => ({ logout: logoutSpy }),
}))

function renderWithRouter(ui: React.ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

beforeEach(() => {
  vi.clearAllMocks()
  apiMocks.fetchUserProfile.mockResolvedValue({
    username: 'testadmin',
    display_name: '张三',
    badge_text: '博士在读',
  })
  apiMocks.updateUserProfile.mockResolvedValue({
    username: 'testadmin',
    display_name: '',
    badge_text: '',
  })
})

describe('UserProfileDialog', () => {
  it('loads and displays profile fields on open', async () => {
    renderWithRouter(<UserProfileDialog open={true} onOpenChange={() => {}} />)
    await waitFor(() => {
      expect(screen.getByDisplayValue('张三')).toBeInTheDocument()
      expect(screen.getByDisplayValue('博士在读')).toBeInTheDocument()
    })
    expect(screen.getByDisplayValue('testadmin')).toHaveAttribute('readonly')
  })

  it('saves profile and notifies change', async () => {
    const onOpenChange = vi.fn()
    apiMocks.updateUserProfile.mockResolvedValue({
      username: 'testadmin',
      display_name: '李四',
      badge_text: '硕士在读',
    })
    renderWithRouter(<UserProfileDialog open={true} onOpenChange={onOpenChange} />)

    await waitFor(() => expect(screen.getByDisplayValue('张三')).toBeInTheDocument())
    fireEvent.change(screen.getByDisplayValue('张三'), { target: { value: '李四' } })
    fireEvent.change(screen.getByDisplayValue('博士在读'), { target: { value: '硕士在读' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(apiMocks.updateUserProfile).toHaveBeenCalledWith({
        display_name: '李四',
        badge_text: '硕士在读',
      })
    })
    expect(userProfileMocks.notifyUserProfileChanged).toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('opens change password dialog when clicking modify password button', async () => {
    renderWithRouter(<UserProfileDialog open={true} onOpenChange={() => {}} />)
    await waitFor(() => expect(screen.getByDisplayValue('张三')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '修改密码' }))
    expect(await screen.findByRole('heading', { name: '修改密码' })).toBeInTheDocument()
  })
})

describe('ChangePasswordDialog', () => {
  it('rejects too short new password without calling API', async () => {
    renderWithRouter(<ChangePasswordDialog open={true} onOpenChange={() => {}} />)
    fireEvent.change(screen.getByLabelText('旧密码'), { target: { value: 'oldpass' } })
    fireEvent.change(screen.getByLabelText('新密码'), { target: { value: '12345' } })
    fireEvent.click(screen.getByRole('button', { name: '确认修改' }))
    await waitFor(() => {
      expect(apiMocks.changePassword).not.toHaveBeenCalled()
    })
  })

  it('rejects mismatched confirm password without calling API', async () => {
    renderWithRouter(<ChangePasswordDialog open={true} onOpenChange={() => {}} />)
    fireEvent.change(screen.getByLabelText('旧密码'), { target: { value: 'oldpass' } })
    fireEvent.change(screen.getByLabelText('新密码'), { target: { value: 'newpass123' } })
    fireEvent.change(screen.getByLabelText('确认新密码'), { target: { value: 'different123' } })
    fireEvent.click(screen.getByRole('button', { name: '确认修改' }))
    await waitFor(() => {
      expect(apiMocks.changePassword).not.toHaveBeenCalled()
    })
  })

  it('submits and logs out on success', async () => {
    const onOpenChange = vi.fn()
    apiMocks.changePassword.mockResolvedValue({ message: '密码修改成功' })
    renderWithRouter(<ChangePasswordDialog open={true} onOpenChange={onOpenChange} />)
    fireEvent.change(screen.getByLabelText('旧密码'), { target: { value: 'oldpass' } })
    fireEvent.change(screen.getByLabelText('新密码'), { target: { value: 'newpass123' } })
    fireEvent.change(screen.getByLabelText('确认新密码'), { target: { value: 'newpass123' } })
    fireEvent.click(screen.getByRole('button', { name: '确认修改' }))

    await waitFor(() => {
      expect(apiMocks.changePassword).toHaveBeenCalledWith({
        old_password: 'oldpass',
        new_password: 'newpass123',
      })
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(logoutSpy).toHaveBeenCalled()
  })
})
