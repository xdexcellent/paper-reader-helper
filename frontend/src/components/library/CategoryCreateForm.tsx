import type { FormEvent } from 'react'

type CategoryCreateFormProps = {
  name: string
  description: string
  onNameChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

export function CategoryCreateForm({
  name,
  description,
  onNameChange,
  onDescriptionChange,
  onSubmit,
}: CategoryCreateFormProps) {
  return (
    <form className="category-create-form" onSubmit={onSubmit}>
      <label className="form-group" htmlFor="library-new-category-name">
        <span>分类名称</span>
        <input id="library-new-category-name" value={name} onChange={(event) => onNameChange(event.target.value)} />
      </label>
      <label className="form-group" htmlFor="library-new-category-description">
        <span>描述</span>
        <input id="library-new-category-description" value={description} onChange={(event) => onDescriptionChange(event.target.value)} />
      </label>
      <button className="btn btn-primary" type="submit">保存分类</button>
    </form>
  )
}
