import { redirect } from "next/navigation"

export default function InvitePage({
  params,
}: {
  params: { token: string }
}) {
  async function acceptInvite(formData: FormData) {
    "use server"

    const password = formData.get("password")

    await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/invites/accept`, {
      method: "POST",
      body: JSON.stringify({
        token: params.token,
        password,
      }),
    })

    redirect("/login")
  }

  return (
    <div>
      <h1>Accept Invite</h1>

      <form action={acceptInvite}>
        <input
          type="password"
          name="password"
          className="text-base"
          placeholder="Create password"
        />
        <button type="submit">Create Account</button>
      </form>
    </div>
  )
}
