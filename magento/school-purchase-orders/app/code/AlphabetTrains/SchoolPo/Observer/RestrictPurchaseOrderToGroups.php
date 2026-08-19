<?php
declare(strict_types=1);

namespace AlphabetTrains\SchoolPo\Observer;

use AlphabetTrains\SchoolPo\Model\Config;
use Magento\Backend\App\Area\FrontNameResolver;
use Magento\Framework\App\State;
use Magento\Framework\Event\Observer;
use Magento\Framework\Event\ObserverInterface;
use Magento\Framework\Exception\LocalizedException;

/**
 * Hides the core "Purchase Order" payment method from storefront checkout unless the
 * quote belongs to an approved customer group. Magento's payment configuration can
 * restrict by country and order total, but not by customer group, which is what an
 * institutional-PO workflow needs.
 */
class RestrictPurchaseOrderToGroups implements ObserverInterface
{
    private const METHOD_CODE = 'purchaseorder';

    public function __construct(
        private readonly Config $config,
        private readonly State $appState
    ) {
    }

    public function execute(Observer $observer): void
    {
        $event = $observer->getEvent();

        $method = $event->getMethodInstance();
        if ($method === null || $method->getCode() !== self::METHOD_CODE) {
            return;
        }

        $result = $event->getResult();
        if ($result === null || $result->getData('is_available') === false) {
            // Another rule (country, order total, method disabled) already ruled it out.
            return;
        }

        // Staff creating an order in the admin can always choose PO.
        if ($this->isAdminArea()) {
            return;
        }

        $quote = $event->getQuote();
        if ($quote === null) {
            return;
        }

        $storeId = (int)$quote->getStoreId();
        if (!$this->config->isGroupRestrictionEnabled($storeId)) {
            return;
        }

        $groupId = (int)$quote->getCustomerGroupId();
        if (!in_array($groupId, $this->config->getAllowedGroupIds($storeId), true)) {
            $result->setData('is_available', false);
        }
    }

    private function isAdminArea(): bool
    {
        try {
            return $this->appState->getAreaCode() === FrontNameResolver::AREA_CODE;
        } catch (LocalizedException) {
            return false;
        }
    }
}
