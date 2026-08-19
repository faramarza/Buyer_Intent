<?php
declare(strict_types=1);

namespace AlphabetTrains\SchoolPo\Model;

use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Store\Model\ScopeInterface;

/**
 * Reads the customer-group restriction settings that this module adds to the
 * core Purchase Order payment method (Stores > Configuration > Sales > Payment Methods).
 */
class Config
{
    private const XML_PATH_ENABLED = 'payment/purchaseorder/allow_specific_customer_groups';
    private const XML_PATH_GROUPS = 'payment/purchaseorder/specific_customer_groups';

    public function __construct(
        private readonly ScopeConfigInterface $scopeConfig
    ) {
    }

    public function isGroupRestrictionEnabled(?int $storeId = null): bool
    {
        return $this->scopeConfig->isSetFlag(
            self::XML_PATH_ENABLED,
            ScopeInterface::SCOPE_STORE,
            $storeId
        );
    }

    /**
     * @return int[] Customer group IDs allowed to check out with a purchase order.
     */
    public function getAllowedGroupIds(?int $storeId = null): array
    {
        $raw = (string)$this->scopeConfig->getValue(
            self::XML_PATH_GROUPS,
            ScopeInterface::SCOPE_STORE,
            $storeId
        );

        if ($raw === '') {
            return [];
        }

        return array_map('intval', array_filter(explode(',', $raw), static fn($id) => $id !== ''));
    }
}
