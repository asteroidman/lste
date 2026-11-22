-- ============================================================
--  罗森塔尔 · 网页版数据库结构（MySQL 8+，utf8mb4）
--  在宝塔「数据库」里建库后，导入本文件即可。
--
--  三条红线落在结构上（与小程序 cloud/authz.js 同义）：
--   ① 只加分：point_ledger.delta 必须 > 0（CHECK），且应用账号对该表**不授 UPDATE/DELETE**；
--   ② 双签：rule_version 同时有 child/parent 签署时间戳才算 effective_at；
--   ③ 家长不可删：脚本里没有任何删除打卡/券的路径（表也不给 DELETE 权限）。
-- ============================================================

SET NAMES utf8mb4;

-- ---------- 账号与家庭 ----------
CREATE TABLE IF NOT EXISTS `user` (
  id            VARCHAR(32)  NOT NULL PRIMARY KEY,
  username      VARCHAR(32)  NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  nickname      VARCHAR(32)  NOT NULL DEFAULT '',
  openid        VARCHAR(64)  NULL,          -- 预留：微信扫码登录
  unionid       VARCHAR(64)  NULL,          -- 预留：与小程序打通
  created_at    BIGINT       NOT NULL,
  UNIQUE KEY uk_user_username (username),
  KEY idx_user_openid (openid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS family (
  id            VARCHAR(32) NOT NULL PRIMARY KEY,
  owner_user_id VARCHAR(32) NOT NULL,
  name          VARCHAR(32) NOT NULL DEFAULT '我们的家',
  invite_code   VARCHAR(12) NOT NULL,
  created_at    BIGINT      NOT NULL,
  UNIQUE KEY uk_family_invite (invite_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS family_member (
  family_id VARCHAR(32) NOT NULL,
  user_id   VARCHAR(32) NOT NULL,
  role      ENUM('child','parent','member') NOT NULL DEFAULT 'member',
  joined_at BIGINT      NOT NULL,
  PRIMARY KEY (family_id, user_id),
  KEY idx_member_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 家庭级设置：学段、家长 PIN、导出配额（免费 10 次）、赞助解锁、共建/双签
CREATE TABLE IF NOT EXISTS setting (
  family_id          VARCHAR(32) NOT NULL PRIMARY KEY,
  stage              VARCHAR(8)  NOT NULL DEFAULT 'mid',
  parent_pin_hash    VARCHAR(100) NULL,
  export_used        INT NOT NULL DEFAULT 0,
  export_free_limit  INT NOT NULL DEFAULT 10,
  sponsor_unlocked   TINYINT NOT NULL DEFAULT 0,
  intro_seen         TINYINT NOT NULL DEFAULT 0,
  amend_point        TINYINT NOT NULL DEFAULT 0,
  amend_item         TINYINT NOT NULL DEFAULT 0,
  amend_reward       TINYINT NOT NULL DEFAULT 0,
  signed_by_child_at BIGINT NULL,
  signed_by_parent_at BIGINT NULL,
  onboarded          TINYINT NOT NULL DEFAULT 0,
  updated_at         BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- 规则库（行为项 / 奖励）----------
CREATE TABLE IF NOT EXISTS behavior_item (
  id         VARCHAR(32) NOT NULL PRIMARY KEY,
  family_id  VARCHAR(32) NOT NULL,
  dimension  VARCHAR(16) NOT NULL,
  name       VARCHAR(80) NOT NULL,
  points     INT NOT NULL,
  daily_limit INT NOT NULL DEFAULT 1,
  active     TINYINT NOT NULL DEFAULT 1,
  created_by VARCHAR(16) NOT NULL DEFAULT 'child',
  created_at BIGINT NOT NULL,
  KEY idx_item_family (family_id),
  CONSTRAINT ck_item_points CHECK (points > 0)          -- 只加分
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 奖励档位：**分值（cost）与内容都可改、可新增**（P3）
CREATE TABLE IF NOT EXISTS reward (
  id        VARCHAR(32) NOT NULL PRIMARY KEY,
  family_id VARCHAR(32) NOT NULL,
  cost      INT NOT NULL,
  tier      VARCHAR(24) NOT NULL DEFAULT '',
  title     VARCHAR(80) NOT NULL,
  descr     VARCHAR(160) NOT NULL DEFAULT '',
  active    TINYINT NOT NULL DEFAULT 1,
  sort      INT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  KEY idx_reward_family (family_id),
  CONSTRAINT ck_reward_cost CHECK (cost > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- 记录（流水只增不改）----------
CREATE TABLE IF NOT EXISTS check_in (
  id         VARCHAR(32) NOT NULL PRIMARY KEY,
  user_id    VARCHAR(32) NOT NULL,
  family_id  VARCHAR(32) NOT NULL,
  item_id    VARCHAR(32) NULL,
  name       VARCHAR(80) NOT NULL DEFAULT '',
  dimension  VARCHAR(16) NOT NULL DEFAULT 'self',
  points     INT NOT NULL,
  date       CHAR(10) NOT NULL,
  is_private TINYINT NOT NULL DEFAULT 0,
  by_parent  TINYINT NOT NULL DEFAULT 0,
  confirmed  TINYINT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  reversed   TINYINT NOT NULL DEFAULT 0,
  KEY idx_checkin_family_date (family_id, date),
  KEY idx_checkin_user (user_id),
  CONSTRAINT ck_checkin_points CHECK (points > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 只增不改：delta > 0，且应用账号对该表不授 UPDATE/DELETE
CREATE TABLE IF NOT EXISTS point_ledger (
  id         VARCHAR(32) NOT NULL PRIMARY KEY,
  user_id    VARCHAR(32) NOT NULL,
  family_id  VARCHAR(32) NOT NULL,
  delta      INT NOT NULL,
  reason     VARCHAR(120) NOT NULL DEFAULT '',
  ref_type   VARCHAR(24) NOT NULL DEFAULT '',
  ref_id     VARCHAR(40) NOT NULL DEFAULT '',
  week_bonus TINYINT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  KEY idx_ledger_family (family_id, created_at),
  CONSTRAINT ck_ledger_delta CHECK (delta > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS week_review (
  id            VARCHAR(32) NOT NULL PRIMARY KEY,
  family_id     VARCHAR(32) NOT NULL,
  user_id       VARCHAR(32) NOT NULL,
  week_start    CHAR(10) NOT NULL,
  highlights    TEXT NULL,
  keep_habit    VARCHAR(80) NOT NULL DEFAULT '',
  next_step     VARCHAR(120) NOT NULL DEFAULT '',
  challenge     VARCHAR(120) NOT NULL DEFAULT '',
  bonus_points  INT NOT NULL DEFAULT 0,
  created_at    BIGINT NOT NULL,
  KEY idx_week_family (family_id, week_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 双签：两个时间戳都非空才写 effective_at
CREATE TABLE IF NOT EXISTS rule_version (
  id                  VARCHAR(32) NOT NULL PRIMARY KEY,
  family_id           VARCHAR(32) NOT NULL,
  version             INT NOT NULL,
  snapshot_json       TEXT NULL,
  signed_by_child_at  BIGINT NULL,
  signed_by_parent_at BIGINT NULL,
  effective_at        BIGINT NULL,
  created_at          BIGINT NOT NULL,
  KEY idx_rule_family (family_id, version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- 兑换与券（不可删）----------
CREATE TABLE IF NOT EXISTS coupon (
  id         VARCHAR(32) NOT NULL PRIMARY KEY,
  family_id  VARCHAR(32) NOT NULL,
  user_id    VARCHAR(32) NOT NULL,
  code       VARCHAR(24) NOT NULL,
  title      VARCHAR(80) NOT NULL DEFAULT '',
  cost       INT NOT NULL DEFAULT 0,
  used       TINYINT NOT NULL DEFAULT 0,
  expires_at CHAR(10) NULL,
  created_at BIGINT NOT NULL,
  UNIQUE KEY uk_coupon_code (code),
  KEY idx_coupon_family (family_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS redemption (
  id         VARCHAR(32) NOT NULL PRIMARY KEY,
  family_id  VARCHAR(32) NOT NULL,
  user_id    VARCHAR(32) NOT NULL,
  reward_id  VARCHAR(32) NULL,
  cost       INT NOT NULL,
  status     ENUM('created','provided','canceled') NOT NULL DEFAULT 'created',
  created_at BIGINT NOT NULL,
  KEY idx_redemption_family (family_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS repair_action (
  id            VARCHAR(32) NOT NULL PRIMARY KEY,
  family_id     VARCHAR(32) NOT NULL,
  user_id       VARCHAR(32) NOT NULL,
  trigger_type  VARCHAR(24) NOT NULL,
  note          VARCHAR(160) NOT NULL DEFAULT '',
  done          TINYINT NOT NULL DEFAULT 0,
  created_at    BIGINT NOT NULL,
  KEY idx_repair_family (family_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS milestone (
  id         VARCHAR(32) NOT NULL PRIMARY KEY,
  family_id  VARCHAR(32) NOT NULL,
  user_id    VARCHAR(32) NOT NULL,
  type       VARCHAR(24) NOT NULL,
  title      VARCHAR(80) NOT NULL DEFAULT '',
  achieved_at BIGINT NULL,
  KEY idx_ms_family (family_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- 家庭工作状态（镜像小程序的 state：items/rewards/log/coupons/week…）----------
-- 说明：为最大化复用小程序规则引擎、保证两端语义一致，家庭的**工作状态**以 JSON 文档保存；
--       point_ledger / check_in 等规范化表保留给后续审计与查询。红线仍由引擎层强制。
CREATE TABLE IF NOT EXISTS family_state (
  family_id  VARCHAR(32) NOT NULL PRIMARY KEY,
  json       LONGTEXT NOT NULL,
  updated_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- 赞助（过渡：静态收款码 + 兑换码）----------
CREATE TABLE IF NOT EXISTS redeem_code (
  code       VARCHAR(24) NOT NULL PRIMARY KEY,
  family_id  VARCHAR(32) NULL,          -- 生成时可绑定或留空
  kind       VARCHAR(24) NOT NULL DEFAULT 'sponsor_unlock',
  `value`    INT NOT NULL DEFAULT 1,    -- 解锁次数 / 标记（反引号：避免关键字歧义）
  used       TINYINT NOT NULL DEFAULT 0,
  used_by    VARCHAR(32) NULL,
  used_at    BIGINT NULL,
  created_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sponsor_order (
  id         VARCHAR(32) NOT NULL PRIMARY KEY,
  family_id  VARCHAR(32) NOT NULL,
  amount_fen INT NOT NULL DEFAULT 0,
  channel    VARCHAR(16) NOT NULL DEFAULT 'manual',
  status     ENUM('pending','paid','canceled') NOT NULL DEFAULT 'paid',
  note       VARCHAR(160) NOT NULL DEFAULT '',
  code_used  VARCHAR(24) NULL,
  created_at BIGINT NOT NULL,
  KEY idx_sponsor_family (family_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
--  红线：应用账号对「只增不改」的表不授 UPDATE/DELETE
--
--  ⚠ 不要整库 REVOKE：会话表 sessions、user、family_state、redeem_code 都需要
--  UPDATE/DELETE，整库撤回会让登录、改数据、核销兑换码全部失效。
--  只对下面这几张「只增不改」的表单独收回权限即可（示例，用户名/主机按实际改）：
--
--    REVOKE UPDATE, DELETE ON `rosenthal`.`point_ledger` FROM 'rosenthal'@'%';
--    REVOKE UPDATE, DELETE ON `rosenthal`.`coupon`       FROM 'rosenthal'@'%';
--    REVOKE UPDATE, DELETE ON `rosenthal`.`redemption`   FROM 'rosenthal'@'%';
--    FLUSH PRIVILEGES;
--
--  （当前引擎把家庭工作状态存在 family_state，上面三张表预留审计/查询；
--    即使尚未写入，也建议先按此收紧，避免以后误用。）
-- ============================================================
