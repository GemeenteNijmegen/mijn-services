import { Notification } from '../../Shared/model/Notification';

/**
 * Defines the strategy interface for configuring different
 * behaviours that the registration service can have.
 * See https://refactoring.guru/design-patterns/strategy
 */
export interface IRegistrationStrategy {
  /**
   * Checks if a notification should be handled for this strategy
   * @param notification
   */
  validateNotification(notification: Notification): string[] | undefined;

  /**
   * Handles the registration of the user's information
   * in OpenKlant.
   * @param notification
   */
  register(notification: Notification): Promise<void>;
}
