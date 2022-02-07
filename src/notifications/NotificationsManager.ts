import type {
  NotificationId,
  Notification,
  NotificationData,
  NotificationIdGenerator,
} from './types';
import type { ACL } from '../acl';
import type { DB, DBLevel } from '@matrixai/db';
import type { KeyManager } from '../keys';
import type { NodeManager } from '../nodes';
import type { NodeId } from '../nodes/types';
import Logger from '@matrixai/logger';
import { IdInternal } from '@matrixai/id';
import { Mutex } from 'async-mutex';
import {
  CreateDestroyStartStop,
  ready,
} from '@matrixai/async-init/dist/CreateDestroyStartStop';
import { utils as idUtils } from '@matrixai/id';
import * as notificationsUtils from './utils';
import * as notificationsErrors from './errors';
import { createNotificationIdGenerator } from './utils';
import { utils as nodesUtils } from '../nodes';

const MESSAGE_COUNT_KEY = 'numMessages';

/**
 * Manage Node Notifications between Gestalts
 */
interface NotificationsManager extends CreateDestroyStartStop {}
@CreateDestroyStartStop(
  new notificationsErrors.ErrorNotificationsRunning(),
  new notificationsErrors.ErrorNotificationsDestroyed(),
)
class NotificationsManager {
  protected logger: Logger;
  protected acl: ACL;
  protected db: DB;
  protected keyManager: KeyManager;
  protected nodeManager: NodeManager;

  protected messageCap: number;

  protected notificationsDomain: string = this.constructor.name;
  protected notificationsDbDomain: Array<string> = [this.notificationsDomain];
  protected notificationsMessagesDbDomain: Array<string> = [
    this.notificationsDomain,
    'messages',
  ];
  protected notificationsDb: DBLevel;
  protected notificationsMessagesDb: DBLevel;
  protected lock: Mutex = new Mutex();

  protected notificationIdGenerator: NotificationIdGenerator;

  static async createNotificationsManager({
    acl,
    db,
    nodeManager,
    keyManager,
    messageCap = 10000,
    logger = new Logger(this.name),
    fresh = false,
  }: {
    acl: ACL;
    db: DB;
    nodeManager: NodeManager;
    keyManager: KeyManager;
    messageCap?: number;
    logger?: Logger;
    fresh?: boolean;
  }): Promise<NotificationsManager> {
    logger.info(`Creating ${this.name}`);
    const notificationsManager = new NotificationsManager({
      acl,
      db,
      keyManager,
      logger,
      messageCap,
      nodeManager,
    });

    await notificationsManager.start({ fresh });
    logger.info(`Created ${this.name}`);
    return notificationsManager;
  }

  constructor({
    acl,
    db,
    nodeManager,
    keyManager,
    messageCap,
    logger,
  }: {
    acl: ACL;
    db: DB;
    nodeManager: NodeManager;
    keyManager: KeyManager;
    messageCap: number;
    logger: Logger;
  }) {
    this.logger = logger;
    this.messageCap = messageCap;
    this.acl = acl;
    this.db = db;
    this.keyManager = keyManager;
    this.nodeManager = nodeManager;
  }

  get locked(): boolean {
    return this.lock.isLocked();
  }

  async start({ fresh }: { fresh: boolean }): Promise<void> {
    this.logger.info(`Starting ${this.constructor.name}`);
    // Sub-level stores MESSAGE_COUNT_KEY -> number (of messages)
    const notificationsDb = await this.db.level(this.notificationsDomain);
    // Sub-sub-level stores NotificationId -> string (message)
    const notificationsMessagesDb = await this.db.level(
      this.notificationsMessagesDbDomain[1],
      notificationsDb,
    );
    if (fresh) {
      await notificationsDb.clear();
    }
    this.notificationsDb = notificationsDb;
    this.notificationsMessagesDb = notificationsMessagesDb;

    // Getting latest ID and creating ID generator FIXME, does this need to be a transaction?
    let latestId: NotificationId | undefined;
    const keyStream = this.notificationsMessagesDb.createKeyStream({
      limit: 1,
      reverse: true,
    });
    for await (const o of keyStream) {
      latestId = IdInternal.fromBuffer<NotificationId>(o);
    }
    this.notificationIdGenerator = createNotificationIdGenerator(latestId);
    this.logger.info(`Started ${this.constructor.name}`);
  }

  async stop() {
    this.logger.info(`Stopping ${this.constructor.name}`);
    this.logger.info(`Stopped ${this.constructor.name}`);
  }

  async destroy() {
    this.logger.info(`Destroying ${this.constructor.name}`);
    const notificationsDb = await this.db.level(this.notificationsDomain);
    await notificationsDb.clear();
    this.logger.info(`Destroyed ${this.constructor.name}`);
  }

  /**
   * Run several operations within the same lock
   * This does not ensure atomicity of the underlying database
   * Database atomicity still depends on the underlying operation
   */
  @ready(new notificationsErrors.ErrorNotificationsNotRunning())
  public async transaction<T>(
    f: (notificationsManager: NotificationsManager) => Promise<T>,
  ): Promise<T> {
    const release = await this.lock.acquire();
    try {
      return await f(this);
    } finally {
      release();
    }
  }

  /**
   * Transaction wrapper that will not lock if the operation was executed
   * within a transaction context
   */
  @ready(new notificationsErrors.ErrorNotificationsNotRunning())
  public async _transaction<T>(f: () => Promise<T>): Promise<T> {
    if (this.lock.isLocked()) {
      return await f();
    } else {
      return await this.transaction(f);
    }
  }

  /**
   * Send a notification to another node
   * The `data` parameter must match one of the NotificationData types outlined in ./types
   */
  @ready(new notificationsErrors.ErrorNotificationsNotRunning())
  public async sendNotification(nodeId: NodeId, data: NotificationData) {
    const notification = {
      data: data,
      senderId: nodesUtils.encodeNodeId(this.nodeManager.getNodeId()),
      isRead: false,
    };
    const signedNotification = await notificationsUtils.signNotification(
      notification,
      this.keyManager.getRootKeyPairPem(),
    );
    await this.nodeManager.sendNotification(nodeId, signedNotification);
  }

  /**
   * Receive a notification
   */
  @ready(new notificationsErrors.ErrorNotificationsNotRunning())
  public async receiveNotification(notification: Notification) {
    await this._transaction(async () => {
      const nodePerms = await this.acl.getNodePerm(
        nodesUtils.decodeNodeId(notification.senderId)!,
      );
      if (nodePerms === undefined) {
        throw new notificationsErrors.ErrorNotificationsPermissionsNotFound();
      }
      // Only keep the message if the sending node has the correct permissions
      if (Object.keys(nodePerms.gestalt).includes('notify')) {
        // If the number stored in notificationsDb >= 10000
        let numMessages = await this.db.get<number>(
          this.notificationsDbDomain,
          MESSAGE_COUNT_KEY,
        );
        if (numMessages === undefined) {
          numMessages = 0;
          await this.db.put(this.notificationsDbDomain, MESSAGE_COUNT_KEY, 0);
        }
        if (numMessages >= this.messageCap) {
          // Remove the oldest notification from notificationsMessagesDb
          const oldestId = await this.getOldestNotificationId();
          await this.removeNotification(oldestId!);
        }
        // Store the new notification in notificationsMessagesDb
        const notificationId = this.notificationIdGenerator();
        await this.db.put(
          this.notificationsMessagesDbDomain,
          idUtils.toBuffer(notificationId),
          notification,
        );
        // Number of messages += 1
        const newNumMessages = numMessages + 1;
        await this.db.put(
          this.notificationsDbDomain,
          MESSAGE_COUNT_KEY,
          newNumMessages,
        );
      }
    });
  }

  /**
   * Read a notification
   */
  @ready(new notificationsErrors.ErrorNotificationsNotRunning())
  public async readNotifications({
    unread = false,
    number = 'all',
    order = 'newest',
  }: {
    unread?: boolean;
    number?: number | 'all';
    order?: 'newest' | 'oldest';
  } = {}): Promise<Array<Notification>> {
    let notificationIds: Array<NotificationId>;
    if (unread === true) {
      notificationIds = await this.getNotificationIds('unread');
    } else {
      notificationIds = await this.getNotificationIds('all');
    }

    if (order === 'newest') {
      notificationIds.reverse();
    }

    if (number === 'all' || number > notificationIds.length) {
      number = notificationIds.length;
    }
    notificationIds = notificationIds.slice(0, number);

    const notifications: Array<Notification> = [];
    for (const id of notificationIds) {
      const notification = await this.readNotificationById(id);
      notifications.push(notification!);
    }

    return notifications;
  }

  /**
   * Linearly searches for a GestaltInvite notification from the supplied NodeId.
   * Returns the notification if found.
   */
  @ready(new notificationsErrors.ErrorNotificationsNotRunning())
  public async findGestaltInvite(
    fromNode: NodeId,
  ): Promise<Notification | undefined> {
    const notifications = await this.getNotifications('all');
    for (const notification of notifications) {
      if (
        notification.data.type === 'GestaltInvite' &&
        nodesUtils.decodeNodeId(notification.senderId)!.equals(fromNode)
      ) {
        return notification;
      }
    }
  }

  /**
   * Removes all notifications
   */
  @ready(new notificationsErrors.ErrorNotificationsNotRunning())
  public async clearNotifications() {
    await this._transaction(async () => {
      const notificationIds = await this.getNotificationIds('all');
      const numMessages = await this.db.get<number>(
        this.notificationsDbDomain,
        MESSAGE_COUNT_KEY,
      );
      if (numMessages !== undefined) {
        for (const id of notificationIds) {
          await this.removeNotification(id);
        }
      }
    });
  }

  private async readNotificationById(
    notificationId: NotificationId,
  ): Promise<Notification | undefined> {
    return await this._transaction(async () => {
      const notification = await this.db.get<Notification>(
        this.notificationsMessagesDbDomain,
        idUtils.toBuffer(notificationId),
      );
      if (notification === undefined) {
        return undefined;
      }
      notification.isRead = true;
      await this.db.put(
        this.notificationsMessagesDbDomain,
        idUtils.toBuffer(notificationId),
        notification,
      );
      return notification;
    });
  }

  private async getNotificationIds(
    type: 'unread' | 'all',
  ): Promise<Array<NotificationId>> {
    return await this._transaction(async () => {
      const notificationIds: Array<NotificationId> = [];
      for await (const o of this.notificationsMessagesDb.createReadStream()) {
        const notificationId = IdInternal.fromBuffer<NotificationId>(
          (o as any).key,
        );
        const data = (o as any).value as Buffer;
        const notification = await this.db.deserializeDecrypt<Notification>(
          data,
          false,
        );
        if (type === 'all') {
          notificationIds.push(notificationId);
        } else if (type === 'unread') {
          if (notification.isRead === false) {
            notificationIds.push(notificationId);
          }
        }
      }
      return notificationIds;
    });
  }

  private async getNotifications(
    type: 'unread' | 'all',
  ): Promise<Array<Notification>> {
    return await this._transaction(async () => {
      const notifications: Array<Notification> = [];
      for await (const v of this.notificationsMessagesDb.createValueStream()) {
        const data = v as Buffer;
        const notification = await this.db.deserializeDecrypt<Notification>(
          data,
          false,
        );
        if (type === 'all') {
          notifications.push(notification);
        } else if (type === 'unread') {
          if (notification.isRead === false) {
            notifications.push(notification);
          }
        }
      }
      return notifications;
    });
  }

  private async getOldestNotificationId(): Promise<NotificationId | undefined> {
    const notificationIds = await this.getNotificationIds('all');
    if (notificationIds.length === 0) {
      return undefined;
    }
    return notificationIds[0];
  }

  private async removeNotification(messageId: NotificationId) {
    await this._transaction(async () => {
      const numMessages = await this.db.get<number>(
        this.notificationsDbDomain,
        MESSAGE_COUNT_KEY,
      );
      if (numMessages === undefined) {
        throw new notificationsErrors.ErrorNotificationsDb();
      }

      await this.db.del(
        this.notificationsMessagesDbDomain,
        idUtils.toBuffer(messageId),
      );
      await this.db.put(
        this.notificationsDbDomain,
        MESSAGE_COUNT_KEY,
        numMessages - 1,
      );
    });
  }
}

export default NotificationsManager;
