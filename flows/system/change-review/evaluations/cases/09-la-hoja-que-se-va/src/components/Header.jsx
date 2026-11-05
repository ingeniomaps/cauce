export default function Header({ title }) {
  return (
    <div className="flex px-6 py-3 bg-gray-800">
      <h1 className="text-lg text-white">{title}</h1>
    </div>
  )
}
