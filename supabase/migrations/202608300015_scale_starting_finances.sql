-- Repair untouched fallback accounts created for custom background IDs such as
-- "lord-of-storms-end". Accounts changed through play are deliberately left alone.
with player_backgrounds as (
  select c.id as campaign_id,
         lower(concat_ws(' ',ch.background->>'id',ch.background->>'name',ch.background->>'description')) as background_text
  from public.campaigns c
  join public.characters ch on ch.campaign_id=c.id and ch.traits->>'player'='true'
), classified as (
  select campaign_id,
    case
      when background_text ~ '\m(great lord|lord of|lady of|duke|duchess|prince|princess|king|queen|sovereign|ruler)\M' then 'great_lord'
      when background_text ~ '\m(lord|lady|noble|baron|baroness|count|countess|earl)\M' then 'landed_lord'
      when background_text ~ '\m(knight|mounted warrior|household guard)\M' then 'knight'
      else 'commoner'
    end as tier
  from player_backgrounds
)
update public.resource_accounts account
set name = case tier when 'great_lord' then 'Great Household Treasury' when 'landed_lord' then 'Household Treasury' else account.name end,
    account_type = case when tier in ('great_lord','landed_lord') then 'treasury' else account.account_type end,
    balance = case tier when 'great_lord' then 25000 when 'landed_lord' then 5000 when 'knight' then 300 else account.balance end,
    recurring_income = case tier when 'great_lord' then 3000 when 'landed_lord' then 500 when 'knight' then 35 else account.recurring_income end,
    recurring_outgoings = case tier when 'great_lord' then 2200 when 'landed_lord' then 350 when 'knight' then 25 else account.recurring_outgoings end,
    updated_at = now()
from classified
where account.campaign_id=classified.campaign_id
  and account.name in ('Personal Purse','Household Treasury')
  and (
    (account.balance=12 and account.recurring_income=2 and account.recurring_outgoings=2)
    or (account.balance=120 and account.recurring_income=20 and account.recurring_outgoings=15)
    or (account.balance=2500 and account.recurring_income=250 and account.recurring_outgoings=180)
  )
  and classified.tier<>'commoner';
