class App {
    var user: User = User()

    func run() {
        user.name = "Alice"
        user.age = 30
        user.update(name: "Alice", age: 30)
    }
}
