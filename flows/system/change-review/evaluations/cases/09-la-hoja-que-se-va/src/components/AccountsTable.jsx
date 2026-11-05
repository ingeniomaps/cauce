import StatusBadge from './StatusBadge'

export default function AccountsTable({ accounts }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {accounts.map((account) => (
          <tr key={account.id} className="border-b border-gray-100">
            <td className="py-2">{account.name}</td>
            <td className="py-2"><StatusBadge status={account.status} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
