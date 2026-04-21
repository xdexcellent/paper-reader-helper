import { Icon } from './UiIcon'

export function FeedbackBanner({
  feedbackMessage,
  errorMessage,
}: {
  feedbackMessage: string
  errorMessage: string
}) {
  if (!feedbackMessage && !errorMessage) {
    return null
  }

  if (errorMessage) {
    return (
      <div className="feedback-banner feedback-error" role="alert">
        <Icon name="warning" className="banner-icon" />
        <span>{errorMessage}</span>
      </div>
    )
  }

  return (
    <div className="feedback-banner feedback-success" role="status">
      <Icon name="check" className="banner-icon" />
      <span>{feedbackMessage}</span>
    </div>
  )
}
