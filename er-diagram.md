# AdminHub ER Diagram

```mermaid
erDiagram
    User ||--o{ Transaction : "makes"
    User ||--o{ Booking : "books"
    User ||--o{ ActivityLog : "has"
    User ||--o{ Notification : "receives"
    Service ||--o{ Booking : "is booked as"
    Booking ||--o{ BookingEvent : "logs"
    Booking ||--o{ Transaction : "paid by"
    Transaction ||--o{ TransactionEvent : "logs"
    Transaction |o--o{ Transaction : "refunded by"

    User {
        uuid id PK
        int number UK
        string email UK
        string name
        enum role
        enum status
        boolean twoFactorEnabled
        datetime lastLoginAt
        datetime deletedAt
    }
    Service {
        uuid id PK
        string name UK
        decimal price
        int defaultDurationMinutes
    }
    Booking {
        uuid id PK
        int number UK
        uuid customerId FK
        uuid serviceId FK
        datetime scheduledAt
        enum status
        enum paymentStatus
        decimal amount
        string invoiceNumber UK
    }
    BookingEvent {
        uuid id PK
        uuid bookingId FK
        string title
        datetime occurredAt
    }
    Transaction {
        uuid id PK
        int number UK
        uuid userId FK
        uuid bookingId FK
        uuid originalTransactionId FK
        enum type
        enum status
        decimal amount
        decimal gatewayFee
    }
    TransactionEvent {
        uuid id PK
        uuid transactionId FK
        enum stage
        datetime occurredAt
    }
    ActivityLog {
        uuid id PK
        uuid userId FK
        string action
        json metadata
    }
    Notification {
        uuid id PK
        uuid userId FK
        boolean isRead
    }
    SystemAlert {
        uuid id PK
        enum severity
        string title
        boolean isResolved
    }
```

## Relationship notes

- **User** is both the admin who logs in (SUPER_ADMIN / ADMIN) and the managed application user (EDITOR / VIEWER). Soft delete via `deletedAt`.
- **Transaction** optionally links to a **Booking**. A refund is a new Transaction row with a negative amount whose `originalTransactionId` points at the original.
- **TransactionEvent** and **BookingEvent** are append-only timelines shown on the detail screens.
- **SystemAlert** is standalone; the dashboard also computes alerts live from data (e.g. pending transaction count).
- Users and Services use `Restrict` on delete so financial history is never orphaned.
