Assignment: Inventory Management – Optimized Search & Sort

## 1. Cấu Trúc Dữ Liệu Được Sử Dụng
*a. List<Product>  (Mảng động)
 **Mục đích:** Lưu trữ tổng hợp tất cả các sản phẩm có trong kho hàng.
 **Lý do lựa chọn:**
  Cung cấp khả năng truy cập phần tử qua chỉ số (index) với thời gian $O(1)$.
  Hỗ trợ tốt cho các thuật toán sắp xếp (QuickSort, MergeSort) và tìm kiếm nhị phân (Binary Search) yêu cầu hoán đổi và truy cập ngẫu nhiên các phần tử.
  
 Tự động thay đổi kích thước khi thêm/xóa phần tử.

*b. Dictionary<string, Product>    (Bảng băm / Hash Map)
 **Mục đích:** Lưu trữ các sản phẩm với khóa (key) là tên sản phẩm (`Name`) và giá trị (value) là đối tượng `Product`.
 **Lý do lựa chọn:**
   Cho phép tra cứu, tìm kiếm sản phẩm theo tên với thời gian trung bình là $O(1)$.
   Kiểm tra xem một tên sản phẩm đã tồn tại hay chưa cực kỳ nhanh chóng, tối ưu hóa cho chức năng tra cứu (Hash-based Lookup) và khi thêm sản phẩm mới để tránh trùng lặp.
## 2.(Pseudo-code) Các Thuật Toán
*a. Tìm kiếm nhị phân (Binary Search) theo ID


function BinarySearchById(targetId):
    low = 0
    high = list.length - 1
    
    while low <= high:
        mid = low + (high - low) / 2
        
        if list[mid].Id == targetId:
            return list[mid]
        else if list[mid].Id < targetId:
            low = mid + 1
        else:
            high = mid - 1
            
    return null // Không tìm thấy




*b. Sắp xếp QuickSort



function QuickSort(list, low, high):
    if low < high:
        pivotIndex = Partition(list, low, high)
        QuickSort(list, low, pivotIndex - 1)
        QuickSort(list, pivotIndex + 1, high)

function Partition(list, low, high):
    pivot = list[high]
    i = low - 1
    
    for j = low to high - 1:
        // So sánh theo ID hoặc Price tùy ngữ cảnh
        if list[j] <= pivot: 
            i = i + 1
            swap(list[i], list[j])
            
    swap(list[i + 1], list[high])
    return i + 1

*c. Sắp xếp MergeSort
function MergeSort(list, left, right):
    if left < right:
        mid = left + (right - left) / 2
        MergeSort(list, left, mid)
        MergeSort(list, mid + 1, right)
        Merge(list, left, mid, right)
function Merge(list, left, mid, right):
    Tạo mảng leftArr từ list[left..mid]
    Tạo mảng rightArr từ list[mid+1..right]
    
    i = 0, j = 0, k = left
    while i < leftArr.length and j < rightArr.length:
        if leftArr[i] <= rightArr[j]:
            list[k] = leftArr[i]
            i = i + 1
        else:
            list[k] = rightArr[j]
            j = j + 1
        k = k + 1
        
    Copy các phần tử còn lại của leftArr vào list (nếu có)
    Copy các phần tử còn lại của rightArr vào list (nếu có)


## 3. Phân tích độ phức tạp thuật toán (Big-O)

* **Thêm sản phẩm (Add Product):** Thời gian $O(n)$, Không gian bộ nhớ $O(1)$. Do phải chạy vòng lặp quét qua toàn bộ `List` để đảm bảo mã ID không bị trùng lặp trước khi chèn phần tử mới.
* **Cập nhật / Xóa sản phẩm (Update / Delete):** Thời gian $O(n)$, Không gian bộ nhớ $O(1)$. Quá trình tìm kiếm phần tử theo ID tốn $O(n)$. Thêm vào đó, thao tác xóa một phần tử ở giữa `List` làm các phần tử phía sau phải dịch chuyển lên cũng tốn tối đa $O(n)$.
* **Tìm kiếm Nhị phân theo ID (Binary Search):** Thời gian $O(\log n)$, Không gian bộ nhớ $O(1)$. Tốc độ cực kỳ tối ưu nhờ nguyên lý liên tục chặt đôi không gian tìm kiếm (Lưu ý: chưa cộng gộp thời gian gọi hàm sắp xếp ban đầu).
* **Tra cứu theo Tên bằng Bảng băm (Hash Lookup):** Thời gian $O(1)$ (trong trường hợp trung bình), Không gian bộ nhớ $O(n)$. Tốc độ phản hồi tức thời nhờ cơ chế hàm băm. Trường hợp xấu nhất suy biến về $O(n)$ rất hiếm khi xảy ra.
* **Sắp xếp Nhanh theo Giá (QuickSort):** Thời gian trung bình $O(n \log n)$, Không gian bộ nhớ $O(\log n)$. Thuật toán thực hiện hoán đổi vị trí trực tiếp trên mảng hiện tại nên tốn rất ít RAM. Thuật toán chỉ bị chậm (rơi vào $O(n^2)$) nếu dữ liệu mảng đã bị sắp xếp sẵn hoặc ngược chiều.
* **Sắp xếp Trộn theo Giá (MergeSort):** Thời gian $O(n \log n)$, Không gian bộ nhớ $O(n)$. Luôn chia đôi mảng đều đặn nên tốc độ cực kỳ ổn định trong mọi tình huống dữ liệu. Điểm trừ duy nhất là tốn thêm không gian RAM (bằng đúng kích thước mảng ban đầu) để cấp phát các mảng phụ khi trộn.

---







## 4. Quá Trình Thực Thi và Kết Quả Đầu Ra (Screenshots)


## Nếu mở ảnh bị lỗi anh chị vui lòng coi ảnh kết quả tại folde ScreenShort gửi kèm ạ !


a.	Màn hình chính và Thêm sản phẩm
-- Hiển thị menu chức năng và việc thêm một số sản phẩm hợp lệ, cảnh báo trùng mã hoặc tên.
<img width="962" height="683" alt="image" src="https://github.com/user-attachments/assets/d8f0e774-a46a-4aa1-82ad-fd9a8082476e" />


   
<img width="962" height="333" alt="image" src="https://github.com/user-attachments/assets/597f58e2-b8f7-4b71-96c2-76ff4c0a08df" />


 
 
b. Sắp xếp và so sánh hiệu suất thuật toán (QuickSort vs MergeSort)
-- Kết quả chạy thực tế với lượng dữ liệu để cho thấy chênh lệch thời gian thực thi.
 <img width="962" height="649" alt="image" src="https://github.com/user-attachments/assets/a0a64fe3-0d9d-4524-bbb1-8151827e85b9" />



c. Tìm kiếm bằng Binary Search (theo ID) và Hash Map (theo Tên)
Tìm kiếm theo ID (binary search )
 

<img width="962" height="390" alt="image" src="https://github.com/user-attachments/assets/08aadac0-78ed-490e-b7f3-1814908e0882" />


Tìm kiếm theo tên (HashMap)
<img width="962" height="437" alt="image" src="https://github.com/user-attachments/assets/36f28e91-e939-415a-9365-15a474c6cf73" />

 
d. Cập nhật và Xóa sản phẩm


Cập nhật sản phẩm 


 <img width="962" height="387" alt="image" src="https://github.com/user-attachments/assets/f4455db8-2fb0-4f0a-ace8-86e81dfb7614" />


xóa sản phẩm

 <img width="962" height="387" alt="image" src="https://github.com/user-attachments/assets/fb104500-7b78-4ba5-9888-24826cdb41ca" />



Sau khi xóa sản phẩm đã biến mất khỏi danh sách 
<img width="1463" height="683" alt="image" src="https://github.com/user-attachments/assets/43b47775-fb6e-4ac8-8ecc-21055fc09cba" />


 



